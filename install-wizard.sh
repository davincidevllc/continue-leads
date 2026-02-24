#!/bin/bash
# Install Brand Launch Wizard + DELETE endpoint + Nav update
# Run from repo root: ~/Downloads/continue-leads
#
# Creates:
#   apps/admin/src/app/brands/new/page.tsx          (Wizard UI)
#   apps/admin/src/app/api/brands/[id]/pages/route.ts  (DELETE endpoint)
#   Updates apps/admin/src/components/ui.tsx          (adds Brands nav link)

set -e

echo "=== Installing Brand Launch Wizard ==="
echo ""

# ──────────────────────────────────────────────────────────────
# 1. DELETE /api/brands/[id]/pages endpoint
# ──────────────────────────────────────────────────────────────
echo "1/3  Creating DELETE /api/brands/[id]/pages endpoint..."
mkdir -p apps/admin/src/app/api/brands/\[id\]/pages

cat > apps/admin/src/app/api/brands/\[id\]/pages/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// DELETE /api/brands/[id]/pages
// Wipe all site_pages for a brand so you can regenerate cleanly.
// Requires typed confirmation: { "confirm": "DELETE" }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;

    // Validate confirmation
    let body: { confirm?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body required with { "confirm": "DELETE" }' },
        { status: 400 }
      );
    }

    if (body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" } in request body.' },
        { status: 400 }
      );
    }

    // Verify brand exists
    const brandCheck = await pool.query('SELECT id, domain FROM sites WHERE id = $1', [siteId]);
    if (brandCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Get counts by page_type before deleting
    const countsBefore = await pool.query(`
      SELECT page_type, COUNT(*)::int AS count
      FROM site_pages
      WHERE site_id = $1
      GROUP BY page_type
      ORDER BY page_type
    `, [siteId]);

    const breakdown: Record<string, number> = {};
    let totalDeleted = 0;
    for (const row of countsBefore.rows) {
      breakdown[row.page_type] = row.count;
      totalDeleted += row.count;
    }

    // Delete all pages
    await pool.query('DELETE FROM site_pages WHERE site_id = $1', [siteId]);

    return NextResponse.json({
      success: true,
      site_id: siteId,
      domain: brandCheck.rows[0].domain,
      deleted: breakdown,
      total_deleted: totalDeleted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
ENDOFFILE

echo "   ✅ DELETE endpoint created"

# ──────────────────────────────────────────────────────────────
# 2. Brand Launch Wizard page
# ──────────────────────────────────────────────────────────────
echo "2/3  Creating Brand Launch Wizard at /brands/new..."
mkdir -p apps/admin/src/app/brands/new

cat > apps/admin/src/app/brands/new/page.tsx << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  slug: string;
  service_count: number;
  vertical_name: string;
}

interface Service {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_popular: boolean;
  service_code: string;
  question_set_count: number;
}

interface StateInfo {
  code: string;
  name: string;
  county_count?: number;
  city_count?: number;
  zip_count?: number;
}

interface County {
  id: number;
  name: string;
  state_code: string;
  city_count?: number;
  zip_count?: number;
}

interface CityPreview {
  id: number;
  name: string;
  slug: string;
  state_code: string;
  county_name: string;
  population: number | null;
  zip_count: number;
}

interface BrandResult {
  brand_id: string;
  domain: string;
  targeting_summary: {
    states: number;
    counties: number;
    zips: number;
    derived_cities: number;
  };
  page_estimate: {
    services: number;
    cities: number;
    money_pages: number;
    total: number;
  };
}

interface PageGenResult {
  pages_created: Record<string, number>;
  total: number;
  caps_applied: {
    max_cities_per_state: number;
    max_money_pages: number;
    cities_before_cap: number;
    cities_after_cap: number;
    cities_trimmed: boolean;
    money_trimmed: boolean;
  };
  warnings: string[];
}

// Template fallback IDs
const FRANCHISE_TEMPLATE_ID = '83885ff9-2d70-4a04-8170-91e3bd423828';
const BASIC_TEMPLATE_ID = '7d074a4b-1903-44d5-9206-cecd62cd2e14';

const STEPS = [
  'Brand Info',
  'Services',
  'Targeting',
  'URL Strategy',
  'Blog',
  'Review',
  'Results',
];

const SLUG_PRESETS = [
  {
    key: 'city-first',
    label: 'City First (recommended)',
    config: {
      money: '/{city-slug}-{state}/{service-slug}',
      service: '/services/{service-slug}',
      city: '/areas/{city-slug}-{state}',
    },
    example: '/boston-ma/interior-painting',
  },
  {
    key: 'service-first',
    label: 'Service First',
    config: {
      money: '/{service-slug}/{city-slug}-{state}',
      service: '/services/{service-slug}',
      city: '/areas/{city-slug}-{state}',
    },
    example: '/interior-painting/boston-ma',
  },
  {
    key: 'flat',
    label: 'Flat',
    config: {
      money: '/{city-slug}-{state}-{service-slug}',
      service: '/services/{service-slug}',
      city: '/areas/{city-slug}-{state}',
    },
    example: '/boston-ma-interior-painting',
  },
];

export default function BrandWizardPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Brand Info
  const [domain, setDomain] = useState('');
  const [brandName, setBrandName] = useState('');
  const [templateId, setTemplateId] = useState(FRANCHISE_TEMPLATE_ID);

  // Step 2: Services
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  // Step 3: Targeting
  const [states, setStates] = useState<StateInfo[]>([]);
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [counties, setCounties] = useState<Record<string, County[]>>({});
  const [selectedCountyIds, setSelectedCountyIds] = useState<Set<number>>(new Set());
  const [zipInput, setZipInput] = useState('');
  const [selectedZips, setSelectedZips] = useState<string[]>([]);
  const [cityPreviews, setCityPreviews] = useState<Record<string, CityPreview[]>>({});
  const [cityFilter, setCityFilter] = useState('');

  // Step 4: URL Strategy
  const [slugPreset, setSlugPreset] = useState('city-first');

  // Step 5: Blog
  const [blogEnabled, setBlogEnabled] = useState(false);
  const [blogFrequency, setBlogFrequency] = useState('weekly');
  const [blogTopicFocus, setBlogTopicFocus] = useState('');

  // Step 7: Results
  const [brandResult, setBrandResult] = useState<BrandResult | null>(null);
  const [pageGenResult, setPageGenResult] = useState<PageGenResult | null>(null);
  const [generatingPages, setGeneratingPages] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');

  // ─── Data Loading ─────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/taxonomy/categories')
      .then(r => r.json())
      .then(data => setCategories(data.categories || data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/geo/states?counts=true')
      .then(r => r.json())
      .then(data => setStates(data.states || data || []))
      .catch(() => {});
  }, []);

  // Load services when category changes
  useEffect(() => {
    if (!selectedCategoryId) {
      setServices([]);
      setSelectedServiceIds(new Set());
      return;
    }
    fetch(`/api/taxonomy/categories/${selectedCategoryId}/services`)
      .then(r => r.json())
      .then(data => {
        const svcs = data.services || data || [];
        setServices(svcs);
        // Auto-select all active
        setSelectedServiceIds(new Set(svcs.filter((s: Service) => s.is_active).map((s: Service) => s.id)));
      })
      .catch(() => {});
  }, [selectedCategoryId]);

  // Load counties & city previews when states change
  const loadStateData = useCallback(async (stateCode: string) => {
    if (counties[stateCode]) return;
    try {
      const [countyRes, cityRes] = await Promise.all([
        fetch(`/api/geo/states/${stateCode}/counties`).then(r => r.json()),
        fetch(`/api/geo/cities?state=${stateCode}&limit=25`).then(r => r.json()),
      ]);
      setCounties(prev => ({ ...prev, [stateCode]: countyRes.counties || countyRes || [] }));
      setCityPreviews(prev => ({ ...prev, [stateCode]: cityRes.cities || cityRes || [] }));
    } catch { /* ignore */ }
  }, [counties]);

  useEffect(() => {
    for (const code of selectedStates) {
      loadStateData(code);
    }
  }, [selectedStates, loadStateData]);

  // ─── Helpers ──────────────────────────────────────────────────

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const activeServices = services.filter(s => s.is_active);
  const selectedSlugConfig = SLUG_PRESETS.find(p => p.key === slugPreset)!;

  const allDerivedCities = Object.entries(cityPreviews)
    .filter(([code]) => selectedStates.has(code))
    .flatMap(([, cities]) => cities);

  const filteredCities = cityFilter
    ? allDerivedCities.filter(c =>
        c.name.toLowerCase().includes(cityFilter.toLowerCase()) ||
        c.state_code.toLowerCase().includes(cityFilter.toLowerCase())
      )
    : allDerivedCities;

  const estimatedPages = {
    home: 1,
    service: selectedServiceIds.size,
    city: Math.min(allDerivedCities.length, 25 * selectedStates.size),
    money: Math.min(
      selectedServiceIds.size * Math.min(allDerivedCities.length, 25 * selectedStates.size),
      250
    ),
    legal: 7,
    blog: blogEnabled ? 1 : 0,
  };
  const totalPages = Object.values(estimatedPages).reduce((a, b) => a + b, 0);

  // ─── Validation ───────────────────────────────────────────────

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return domain.trim().length > 3;
      case 1: return !!selectedCategoryId && selectedServiceIds.size > 0;
      case 2: return selectedStates.size > 0 || selectedZips.length > 0;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  // ─── Actions ──────────────────────────────────────────────────

  const handleCreateBrand = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        domain: domain.trim().toLowerCase(),
        brand_name: brandName.trim() || null,
        category_id: selectedCategoryId,
        template_id: templateId,
        service_ids: Array.from(selectedServiceIds),
        target_states: Array.from(selectedStates),
        target_county_ids: Array.from(selectedCountyIds),
        target_zips: selectedZips,
        slug_strategy_config: selectedSlugConfig.config,
        blog_config: {
          enabled: blogEnabled,
          frequency: blogEnabled ? blogFrequency : undefined,
          topic_focus: blogEnabled && blogTopicFocus ? blogTopicFocus : undefined,
        },
      };

      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create brand');

      setBrandResult(data);
      setStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePages = async () => {
    if (!brandResult) return;
    setGeneratingPages(true);
    setError('');
    try {
      const res = await fetch(`/api/brands/${brandResult.brand_id}/generate-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate pages');
      setPageGenResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setGeneratingPages(false);
    }
  };

  const handleDeletePages = async () => {
    if (!brandResult || deleteTyped !== 'DELETE') return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/brands/${brandResult.brand_id}/pages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete pages');
      setPageGenResult(null);
      setShowDeleteConfirm(false);
      setDeleteTyped('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ─── ZIP management ───────────────────────────────────────────

  const addZips = () => {
    const raw = zipInput.replace(/[^0-9,\s]/g, '');
    const zips = raw.split(/[,\s]+/).filter(z => /^\d{5}$/.test(z));
    const unique = [...new Set([...selectedZips, ...zips])];
    setSelectedZips(unique);
    setZipInput('');
  };

  const removeZip = (zip: string) => {
    setSelectedZips(prev => prev.filter(z => z !== zip));
  };

  // ─── Toggle helpers ───────────────────────────────────────────

  const toggleState = (code: string) => {
    setSelectedStates(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleCounty = (id: number) => {
    setSelectedCountyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleService = (id: string) => {
    setSelectedServiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllServices = () => {
    setSelectedServiceIds(new Set(activeServices.map(s => s.id)));
  };

  const deselectAllServices = () => {
    setSelectedServiceIds(new Set());
  };

  // ─── Render Steps ─────────────────────────────────────────────

  const renderStepIndicator = () => (
    <div className="d-flex mb-4 gap-1">
      {STEPS.map((label, i) => (
        <div
          key={i}
          className={`flex-fill text-center py-2 px-1 rounded-1 small ${
            i === step
              ? 'bg-primary text-white fw-semibold'
              : i < step
              ? 'bg-success bg-opacity-25 text-success'
              : 'bg-light text-muted'
          }`}
          style={{ cursor: i < step ? 'pointer' : 'default', fontSize: '0.8rem' }}
          onClick={() => i < step && setStep(i)}
        >
          {i < step ? '✓ ' : ''}{label}
        </div>
      ))}
    </div>
  );

  // Step 1: Brand Info
  const renderBrandInfo = () => (
    <div className="card">
      <div className="card-header fw-semibold">Step 1: Brand Info</div>
      <div className="card-body">
        <div className="mb-3">
          <label className="form-label fw-semibold">Domain <span className="text-danger">*</span></label>
          <input
            type="text"
            className="form-control"
            placeholder="example.com"
            value={domain}
            onChange={e => setDomain(e.target.value)}
          />
          <div className="form-text">The domain for this brand site (without https://)</div>
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Brand Name</label>
          <input
            type="text"
            className="form-control"
            placeholder="Optional brand/company name"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
          />
          <div className="form-text">Used in page titles. Falls back to category name if empty.</div>
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">Template</label>
          <select
            className="form-select"
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
          >
            <option value={FRANCHISE_TEMPLATE_ID}>Franchise City Page (recommended)</option>
            <option value={BASIC_TEMPLATE_ID}>Basic Service Landing</option>
          </select>
        </div>
      </div>
    </div>
  );

  // Step 2: Services
  const renderServices = () => (
    <div className="card">
      <div className="card-header fw-semibold">Step 2: Category &amp; Services</div>
      <div className="card-body">
        <div className="mb-3">
          <label className="form-label fw-semibold">Category <span className="text-danger">*</span></label>
          <select
            className="form-select"
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
          >
            <option value="">-- Select Category --</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.service_count} services)
              </option>
            ))}
          </select>
        </div>

        {services.length > 0 && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label fw-semibold mb-0">
                Services ({selectedServiceIds.size}/{activeServices.length} selected)
              </label>
              <div>
                <button className="btn btn-sm btn-outline-primary me-1" onClick={selectAllServices}>
                  Select All
                </button>
                <button className="btn btn-sm btn-outline-secondary" onClick={deselectAllServices}>
                  Deselect All
                </button>
              </div>
            </div>
            <div className="border rounded p-2" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {activeServices.map(svc => (
                <div key={svc.id} className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={`svc-${svc.id}`}
                    checked={selectedServiceIds.has(svc.id)}
                    onChange={() => toggleService(svc.id)}
                  />
                  <label className="form-check-label" htmlFor={`svc-${svc.id}`}>
                    {svc.name}
                    {svc.is_popular && <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.65rem' }}>Popular</span>}
                    {svc.question_set_count > 0 && <span className="badge bg-info ms-1" style={{ fontSize: '0.65rem' }}>{svc.question_set_count} Q</span>}
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Step 3: Targeting
  const renderTargeting = () => (
    <div className="card">
      <div className="card-header fw-semibold">Step 3: Geo Targeting</div>
      <div className="card-body">
        {/* State Selection */}
        <div className="mb-3">
          <label className="form-label fw-semibold">
            States ({selectedStates.size} selected)
          </label>
          <div className="border rounded p-2" style={{ maxHeight: 200, overflowY: 'auto' }}>
            <div className="row row-cols-3 g-1">
              {states.map(st => (
                <div key={st.code} className="col">
                  <div
                    className={`border rounded px-2 py-1 small ${
                      selectedStates.has(st.code)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-light'
                    }`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleState(st.code)}
                  >
                    <strong>{st.code}</strong>{' '}
                    <span className="opacity-75">{st.name}</span>
                    {st.city_count && (
                      <span className="float-end opacity-50" style={{ fontSize: '0.7rem' }}>
                        {st.city_count.toLocaleString()} cities
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* County Chips */}
        {Array.from(selectedStates).map(code => (
          counties[code] && counties[code].length > 0 && (
            <div key={`counties-${code}`} className="mb-3">
              <label className="form-label fw-semibold small">
                Counties in {code} ({counties[code].length})
              </label>
              <div className="d-flex flex-wrap gap-1">
                {counties[code].map(county => (
                  <span
                    key={county.id}
                    className={`badge ${
                      selectedCountyIds.has(county.id) ? 'bg-primary' : 'bg-light text-dark border'
                    }`}
                    style={{ cursor: 'pointer', fontSize: '0.75rem' }}
                    onClick={() => toggleCounty(county.id)}
                  >
                    {county.name}
                    {county.city_count ? ` (${county.city_count})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )
        ))}

        {/* ZIP Input */}
        <div className="mb-3">
          <label className="form-label fw-semibold">Additional ZIP Codes</label>
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Enter ZIP codes (comma or space separated)"
              value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addZips())}
            />
            <button className="btn btn-outline-primary" onClick={addZips}>Add</button>
          </div>
          {selectedZips.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-1">
              {selectedZips.map(zip => (
                <span key={zip} className="badge bg-secondary">
                  {zip}
                  <button
                    className="btn-close btn-close-white ms-1"
                    style={{ fontSize: '0.5rem' }}
                    onClick={() => removeZip(zip)}
                  />
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Derived Cities Preview */}
        {allDerivedCities.length > 0 && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label fw-semibold mb-0">
                Derived Cities Preview ({allDerivedCities.length} cities)
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                style={{ width: 200 }}
                placeholder="Filter cities..."
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
              />
            </div>
            <div className="table-responsive" style={{ maxHeight: 250, overflowY: 'auto' }}>
              <table className="table table-sm table-striped mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>City</th>
                    <th>State</th>
                    <th>County</th>
                    <th className="text-end">Population</th>
                    <th className="text-end">ZIPs</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCities.slice(0, 100).map(city => (
                    <tr key={`${city.state_code}-${city.id}`}>
                      <td>{city.name}</td>
                      <td>{city.state_code}</td>
                      <td className="text-muted small">{city.county_name}</td>
                      <td className="text-end">
                        {city.population ? city.population.toLocaleString() : '—'}
                      </td>
                      <td className="text-end">{city.zip_count || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredCities.length > 100 && (
              <div className="text-muted small text-center mt-1">
                Showing first 100 of {filteredCities.length} cities
              </div>
            )}
          </div>
        )}

        {/* Coverage Summary */}
        <div className="mt-3 p-3 bg-light rounded">
          <h6 className="mb-2">Coverage Summary</h6>
          <div className="row text-center">
            <div className="col"><strong>{selectedStates.size}</strong><br/><small className="text-muted">States</small></div>
            <div className="col"><strong>{selectedCountyIds.size}</strong><br/><small className="text-muted">Counties</small></div>
            <div className="col"><strong>{selectedZips.length}</strong><br/><small className="text-muted">ZIPs</small></div>
            <div className="col"><strong>{allDerivedCities.length}</strong><br/><small className="text-muted">Cities (preview)</small></div>
          </div>
        </div>
      </div>
    </div>
  );

  // Step 4: URL Strategy
  const renderUrlStrategy = () => {
    const exampleService = services[0]?.slug || 'interior-painting';
    return (
      <div className="card">
        <div className="card-header fw-semibold">Step 4: URL Strategy</div>
        <div className="card-body">
          <p className="text-muted">Choose how URLs are structured for money pages (city + service combinations).</p>
          {SLUG_PRESETS.map(preset => (
            <div
              key={preset.key}
              className={`border rounded p-3 mb-2 ${
                slugPreset === preset.key ? 'border-primary bg-primary bg-opacity-10' : ''
              }`}
              style={{ cursor: 'pointer' }}
              onClick={() => setSlugPreset(preset.key)}
            >
              <div className="form-check mb-1">
                <input
                  type="radio"
                  className="form-check-input"
                  checked={slugPreset === preset.key}
                  onChange={() => setSlugPreset(preset.key)}
                />
                <label className="form-check-label fw-semibold">{preset.label}</label>
              </div>
              <div className="ps-4">
                <code className="text-primary">{domain || 'example.com'}{preset.example}</code>
                <div className="text-muted small mt-1">
                  Pattern: <code>{preset.config.money}</code>
                </div>
              </div>
            </div>
          ))}

          <div className="mt-3 p-3 bg-light rounded">
            <h6 className="mb-2">URL Examples with Your Settings</h6>
            <table className="table table-sm mb-0">
              <tbody>
                <tr>
                  <td className="text-muted">Home</td>
                  <td><code>{domain || 'example.com'}/</code></td>
                </tr>
                <tr>
                  <td className="text-muted">Service</td>
                  <td><code>{domain || 'example.com'}{selectedSlugConfig.config.service.replace('{service-slug}', exampleService)}</code></td>
                </tr>
                <tr>
                  <td className="text-muted">City</td>
                  <td><code>{domain || 'example.com'}{selectedSlugConfig.config.city.replace('{city-slug}', 'boston').replace('{state}', 'ma')}</code></td>
                </tr>
                <tr>
                  <td className="text-muted fw-semibold">Money</td>
                  <td><code>{domain || 'example.com'}{selectedSlugConfig.config.money.replace('{city-slug}', 'boston').replace('{state}', 'ma').replace('{service-slug}', exampleService)}</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Step 5: Blog
  const renderBlog = () => (
    <div className="card">
      <div className="card-header fw-semibold">Step 5: Blog Settings</div>
      <div className="card-body">
        <div className="form-check form-switch mb-3">
          <input
            type="checkbox"
            className="form-check-input"
            id="blogToggle"
            checked={blogEnabled}
            onChange={e => setBlogEnabled(e.target.checked)}
          />
          <label className="form-check-label fw-semibold" htmlFor="blogToggle">
            Enable Blog
          </label>
        </div>

        {blogEnabled && (
          <>
            <div className="mb-3">
              <label className="form-label fw-semibold">Posting Frequency</label>
              <select
                className="form-select"
                value={blogFrequency}
                onChange={e => setBlogFrequency(e.target.value)}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label fw-semibold">Topic Focus (optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g., tips and guides, seasonal advice, DIY vs professional"
                value={blogTopicFocus}
                onChange={e => setBlogTopicFocus(e.target.value)}
              />
            </div>

            <div className="p-3 bg-light rounded">
              <h6 className="mb-2">Blog Generation Pipeline</h6>
              <p className="small text-muted mb-2">
                When content generation runs, the system will:
              </p>
              <ol className="small text-muted mb-0">
                <li>Create a <code>/blog</code> index page</li>
                <li>Generate blog posts based on your category + services</li>
                <li>Publish on your selected frequency ({blogFrequency})</li>
                <li>Each post targets long-tail keywords related to your services</li>
              </ol>
            </div>
          </>
        )}

        {!blogEnabled && (
          <p className="text-muted">Blog is disabled. You can enable it later from the brand settings.</p>
        )}
      </div>
    </div>
  );

  // Step 6: Review
  const renderReview = () => (
    <div className="card">
      <div className="card-header fw-semibold">Step 6: Review &amp; Create</div>
      <div className="card-body">
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <div className="p-3 bg-light rounded h-100">
              <h6>Brand</h6>
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr><td className="text-muted">Domain</td><td className="fw-semibold">{domain}</td></tr>
                  <tr><td className="text-muted">Brand Name</td><td>{brandName || '(auto from category)'}</td></tr>
                  <tr><td className="text-muted">Template</td><td>{templateId === FRANCHISE_TEMPLATE_ID ? 'Franchise City Page' : 'Basic Landing'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="col-md-6">
            <div className="p-3 bg-light rounded h-100">
              <h6>Services</h6>
              <p className="mb-1">
                <strong>{selectedCategory?.name}</strong>
              </p>
              <p className="small text-muted mb-0">
                {selectedServiceIds.size} of {activeServices.length} services selected
              </p>
            </div>
          </div>
          <div className="col-md-6">
            <div className="p-3 bg-light rounded h-100">
              <h6>Targeting</h6>
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr><td className="text-muted">States</td><td>{selectedStates.size} ({Array.from(selectedStates).join(', ')})</td></tr>
                  <tr><td className="text-muted">Counties</td><td>{selectedCountyIds.size}</td></tr>
                  <tr><td className="text-muted">ZIPs</td><td>{selectedZips.length}</td></tr>
                  <tr><td className="text-muted">Cities (est.)</td><td>~{allDerivedCities.length}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="col-md-6">
            <div className="p-3 bg-light rounded h-100">
              <h6>URL &amp; Blog</h6>
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr><td className="text-muted">URL Pattern</td><td>{selectedSlugConfig.label}</td></tr>
                  <tr><td className="text-muted">Blog</td><td>{blogEnabled ? blogFrequency : 'Disabled'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Page Estimate */}
        <div className="p-3 bg-primary bg-opacity-10 rounded mb-3">
          <h6 className="mb-2">Estimated Page Inventory</h6>
          <div className="row text-center">
            <div className="col"><strong>{estimatedPages.home}</strong><br/><small>Home</small></div>
            <div className="col"><strong>{estimatedPages.service}</strong><br/><small>Service</small></div>
            <div className="col"><strong>{estimatedPages.city}</strong><br/><small>City</small></div>
            <div className="col"><strong>{estimatedPages.money}</strong><br/><small>Money</small></div>
            <div className="col"><strong>{estimatedPages.legal}</strong><br/><small>Legal</small></div>
            {blogEnabled && <div className="col"><strong>1</strong><br/><small>Blog</small></div>}
            <div className="col bg-white rounded"><strong className="text-primary fs-5">{totalPages}</strong><br/><small className="fw-semibold">Total</small></div>
          </div>
        </div>

        <div className="d-flex justify-content-between">
          <div className="text-muted small">
            Brand starts as <span className="badge bg-secondary">DRAFT</span> with{' '}
            <span className="badge bg-secondary">noindex</span> until approved.
          </div>
          <button
            className="btn btn-primary btn-lg"
            disabled={loading}
            onClick={handleCreateBrand}
          >
            {loading ? (
              <><span className="spinner-border spinner-border-sm me-1" /> Creating...</>
            ) : (
              'Create Brand'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Step 7: Results
  const renderResults = () => (
    <div className="card">
      <div className="card-header fw-semibold bg-success text-white">
        Brand Created Successfully
      </div>
      <div className="card-body">
        {brandResult && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="p-3 bg-light rounded">
                  <h6>Brand Details</h6>
                  <table className="table table-sm table-borderless mb-0">
                    <tbody>
                      <tr><td className="text-muted">ID</td><td><code className="small">{brandResult.brand_id}</code></td></tr>
                      <tr><td className="text-muted">Domain</td><td className="fw-semibold">{brandResult.domain}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="col-md-6">
                <div className="p-3 bg-light rounded">
                  <h6>Targeting Summary</h6>
                  <div className="row text-center">
                    <div className="col"><strong>{brandResult.targeting_summary.states}</strong><br/><small>States</small></div>
                    <div className="col"><strong>{brandResult.targeting_summary.counties}</strong><br/><small>Counties</small></div>
                    <div className="col"><strong>{brandResult.targeting_summary.zips}</strong><br/><small>ZIPs</small></div>
                    <div className="col"><strong>{brandResult.targeting_summary.derived_cities}</strong><br/><small>Cities</small></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Page Generation */}
            {!pageGenResult ? (
              <div className="text-center py-4">
                <p className="text-muted mb-3">
                  Brand created with {brandResult.page_estimate.total} estimated pages.
                  Generate the page inventory now?
                </p>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={generatingPages}
                  onClick={handleGeneratePages}
                >
                  {generatingPages ? (
                    <><span className="spinner-border spinner-border-sm me-1" /> Generating Pages...</>
                  ) : (
                    'Generate Pages'
                  )}
                </button>
              </div>
            ) : (
              <div>
                <div className="alert alert-success">
                  <strong>{pageGenResult.total} pages generated</strong>
                </div>

                <div className="row text-center mb-3">
                  {Object.entries(pageGenResult.pages_created).map(([type, count]) => (
                    <div key={type} className="col">
                      <strong>{count}</strong><br/>
                      <small className="text-muted">{type}</small>
                    </div>
                  ))}
                </div>

                {pageGenResult.warnings.length > 0 && (
                  <div className="alert alert-warning small">
                    <strong>Warnings:</strong>
                    <ul className="mb-0 mt-1">
                      {pageGenResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                <hr />

                <div className="d-flex justify-content-between align-items-center">
                  <Link href="/" className="btn btn-outline-primary">
                    Back to Dashboard
                  </Link>

                  {!showDeleteConfirm ? (
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete &amp; Regenerate
                    </button>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        style={{ width: 120 }}
                        placeholder='Type DELETE'
                        value={deleteTyped}
                        onChange={e => setDeleteTyped(e.target.value)}
                      />
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={deleteTyped !== 'DELETE' || loading}
                        onClick={handleDeletePages}
                      >
                        {loading ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => { setShowDeleteConfirm(false); setDeleteTyped(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ─── Main Render ──────────────────────────────────────────────

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderBrandInfo();
      case 1: return renderServices();
      case 2: return renderTargeting();
      case 3: return renderUrlStrategy();
      case 4: return renderBlog();
      case 5: return renderReview();
      case 6: return renderResults();
      default: return null;
    }
  };

  return (
    <AuthLayout>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Brand Launch Wizard</h4>
        <Link href="/" className="btn btn-outline-secondary btn-sm">Dashboard</Link>
      </div>

      {renderStepIndicator()}

      {error && (
        <div className="alert alert-danger alert-dismissible mb-3">
          {error}
          <button className="btn-close" onClick={() => setError('')} />
        </div>
      )}

      {renderCurrentStep()}

      {/* Navigation Buttons */}
      {step < 6 && (
        <div className="d-flex justify-content-between mt-3">
          <button
            className="btn btn-outline-secondary"
            disabled={step === 0}
            onClick={() => setStep(s => s - 1)}
          >
            Previous
          </button>
          {step < 5 ? (
            <button
              className="btn btn-primary"
              disabled={!canProceed()}
              onClick={() => setStep(s => s + 1)}
            >
              Next
            </button>
          ) : null}
        </div>
      )}
    </AuthLayout>
  );
}
ENDOFFILE

echo "   ✅ Wizard page created"

# ──────────────────────────────────────────────────────────────
# 3. Update Nav to include Brands link
# ──────────────────────────────────────────────────────────────
echo "3/3  Adding Brands link to navigation..."

# Check if already added
if grep -q "New Brand" apps/admin/src/components/ui.tsx; then
  echo "   ⏭  Brands link already exists in nav"
else
  sed -i.bak "s|{ href: '/sites', label: 'Sites', icon: '🌐' },|{ href: '/brands/new', label: 'New Brand', icon: '🚀' },\n    { href: '/sites', label: 'Sites', icon: '🌐' },|" apps/admin/src/components/ui.tsx
  rm -f apps/admin/src/components/ui.tsx.bak
  echo "   ✅ Nav updated"
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Files created/updated:"
echo "  ✅ apps/admin/src/app/api/brands/[id]/pages/route.ts  (DELETE endpoint)"
echo "  ✅ apps/admin/src/app/brands/new/page.tsx              (Wizard UI)"
echo "  ✅ apps/admin/src/components/ui.tsx                    (Nav link added)"
echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'feat: brand launch wizard + delete pages endpoint'"
echo "  git push origin main"
echo ""
echo "CI/CD will deploy to staging automatically."
