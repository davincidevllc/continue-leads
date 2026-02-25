#!/bin/bash
# Install V2 Targeting: Step 3 redesign (city cap, pin, exclude)
# Run from repo root: ~/Downloads/continue-leads
#
# Changes:
#   apps/admin/src/app/brands/new/page.tsx           (Wizard V2 - redesigned Step 3)
#   apps/admin/src/app/api/brands/route.ts           (Accept city_cap, pinned, excluded)
#   apps/admin/src/app/api/brands/[id]/generate-pages/route.ts (Pinned-first ranking, read cap from config)

set -e

echo "=== Installing V2 Targeting ==="
echo ""

# ──────────────────────────────────────────────────────────────
# 1. Verify we're in the right directory
# ──────────────────────────────────────────────────────────────
if [ ! -f "apps/admin/src/app/brands/new/page.tsx" ]; then
  echo "❌ Error: apps/admin/src/app/brands/new/page.tsx not found."
  echo "   Run this script from the repo root (e.g., ~/Downloads/continue-leads)"
  exit 1
fi

echo "1/3  Updating Brand Launch Wizard (page.tsx)..."
cat > apps/admin/src/app/brands/new/page.tsx << 'ENDOFFILE_PAGE'
'use client';

import { useState, useEffect, useMemo } from 'react';
import AuthLayout from '@/components/AuthLayout';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────

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

const CAP_OPTIONS = [25, 50, 100];

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

  // Step 3: Targeting (V2)
  const [states, setStates] = useState<StateInfo[]>([]);
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [cityCap, setCityCap] = useState(25);
  const [cityPreviews, setCityPreviews] = useState<Record<string, CityPreview[]>>({});
  const [pinnedCities, setPinnedCities] = useState<CityPreview[]>([]);
  const [excludedCityIds, setExcludedCityIds] = useState<Set<number>>(new Set());
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySearchResults, setCitySearchResults] = useState<CityPreview[]>([]);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
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

  // ─── Data Loading ─────────────────────────────────────────

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
        setSelectedServiceIds(new Set(svcs.filter((s: Service) => s.is_active).map((s: Service) => s.id)));
      })
      .catch(() => {});
  }, [selectedCategoryId]);

  // Load city previews when states or cap changes
  useEffect(() => {
    if (selectedStates.size === 0) {
      setCityPreviews({});
      return;
    }
    const fetchCities = async () => {
      const newPreviews: Record<string, CityPreview[]> = {};
      for (const code of selectedStates) {
        try {
          const res = await fetch(
            `/api/geo/cities?state=${code}&limit=${cityCap}&sort=population`
          );
          const data = await res.json();
          newPreviews[code] = data.cities || [];
        } catch { /* ignore */ }
      }
      setCityPreviews(newPreviews);
    };
    fetchCities();
  }, [selectedStates, cityCap]);

  // City search for pin feature (debounced)
  useEffect(() => {
    if (citySearchQuery.length < 2) {
      setCitySearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setCitySearchLoading(true);
      try {
        // Search across selected states, or globally if none selected
        const stateParam = selectedStates.size === 1
          ? `&state=${Array.from(selectedStates)[0]}`
          : '';
        const res = await fetch(
          `/api/geo/cities?q=${encodeURIComponent(citySearchQuery)}${stateParam}&limit=10&sort=population`
        );
        const data = await res.json();
        setCitySearchResults(data.cities || []);
      } catch {
        setCitySearchResults([]);
      } finally {
        setCitySearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [citySearchQuery, selectedStates]);

  // ─── Computed Values ──────────────────────────────────────

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const activeServices = services.filter(s => s.is_active);
  const selectedSlugConfig = SLUG_PRESETS.find(p => p.key === slugPreset)!;

  // Deterministic city list: pinned first → top by population → exclude removed
  const computedCities = useMemo(() => {
    // Gather all top-N cities from selected states
    const stateCities = Object.entries(cityPreviews)
      .filter(([code]) => selectedStates.has(code))
      .flatMap(([, cities]) => cities);

    // Remove excluded
    const withoutExcluded = stateCities.filter(c => !excludedCityIds.has(c.id));

    // Merge pinned at the top (deduplicate)
    const existingIds = new Set(withoutExcluded.map(c => c.id));
    const uniquePinned = pinnedCities.filter(c =>
      !excludedCityIds.has(c.id) && !existingIds.has(c.id)
    );

    return [...uniquePinned, ...withoutExcluded];
  }, [cityPreviews, selectedStates, excludedCityIds, pinnedCities]);

  // Excluded city details (for the collapsed list)
  const excludedCitiesList = useMemo(() => {
    const allCities = Object.entries(cityPreviews)
      .filter(([code]) => selectedStates.has(code))
      .flatMap(([, cities]) => cities);
    return allCities.filter(c => excludedCityIds.has(c.id));
  }, [cityPreviews, selectedStates, excludedCityIds]);

  // Filtered display list
  const filteredCities = cityFilter
    ? computedCities.filter(c =>
        c.name.toLowerCase().includes(cityFilter.toLowerCase()) ||
        c.state_code.toLowerCase().includes(cityFilter.toLowerCase())
      )
    : computedCities;

  const pinnedIds = new Set(pinnedCities.map(c => c.id));

  const estimatedPages = {
    home: 1,
    service: selectedServiceIds.size,
    city: computedCities.length,
    money: Math.min(selectedServiceIds.size * computedCities.length, 250),
    legal: 7,
    blog: blogEnabled ? 1 : 0,
  };
  const totalPages = Object.values(estimatedPages).reduce((a, b) => a + b, 0);

  // ─── Validation ───────────────────────────────────────────

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return domain.trim().length > 3;
      case 1: return !!selectedCategoryId && selectedServiceIds.size > 0;
      case 2: return selectedStates.size > 0;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  // ─── Actions ──────────────────────────────────────────────

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
        target_county_ids: [],
        target_zips: [],
        city_cap: cityCap,
        pinned_city_ids: pinnedCities.map(c => c.id),
        excluded_city_ids: Array.from(excludedCityIds),
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

  // ─── Pin / Exclude helpers ────────────────────────────────

  const pinCity = (city: CityPreview) => {
    if (pinnedIds.has(city.id)) return;
    setPinnedCities(prev => [...prev, city]);
    // If it was excluded, un-exclude it
    setExcludedCityIds(prev => {
      const next = new Set(prev);
      next.delete(city.id);
      return next;
    });
    setCitySearchQuery('');
    setCitySearchResults([]);
  };

  const unpinCity = (cityId: number) => {
    setPinnedCities(prev => prev.filter(c => c.id !== cityId));
  };

  const excludeCity = (cityId: number) => {
    setExcludedCityIds(prev => new Set([...prev, cityId]));
    // If it was pinned, unpin it
    setPinnedCities(prev => prev.filter(c => c.id !== cityId));
  };

  const restoreCity = (cityId: number) => {
    setExcludedCityIds(prev => {
      const next = new Set(prev);
      next.delete(cityId);
      return next;
    });
  };

  // ─── Toggle helpers ───────────────────────────────────────

  const toggleState = (code: string) => {
    setSelectedStates(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAllStates = () => {
    setSelectedStates(new Set(states.map(s => s.code)));
  };

  const clearAllStates = () => {
    setSelectedStates(new Set());
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

  // ─── Render Steps ─────────────────────────────────────────

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

  // ─── Step 3: Geo Targeting (V2) ──────────────────────────

  const renderTargeting = () => (
    <div className="card">
      <div className="card-header fw-semibold">Step 3: Geo Targeting</div>
      <div className="card-body">

        {/* ── Section 1: State Selection ── */}
        <div className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <label className="form-label fw-semibold mb-0">
              States ({selectedStates.size} selected)
            </label>
            <div>
              <button className="btn btn-sm btn-outline-primary me-1" onClick={selectAllStates}>
                Select All
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={clearAllStates}>
                Clear
              </button>
            </div>
          </div>
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
                    {st.city_count != null && (
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

        {/* ── Section 2: City Cap ── */}
        {selectedStates.size > 0 && (
          <div className="mb-4">
            <div className="d-flex align-items-center gap-3">
              <div>
                <label className="form-label fw-semibold mb-1">Cities per State</label>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 100 }}
                  value={cityCap}
                  onChange={e => setCityCap(Number(e.target.value))}
                >
                  {CAP_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="text-muted small" style={{ paddingTop: 20 }}>
                {cityCap} cities × {selectedStates.size} state{selectedStates.size > 1 ? 's' : ''} × {selectedServiceIds.size} service{selectedServiceIds.size > 1 ? 's' : ''}{' '}
                = <strong>{Math.min(cityCap * selectedStates.size * selectedServiceIds.size, 250)}</strong> money pages
                {cityCap * selectedStates.size * selectedServiceIds.size > 250 && (
                  <span className="text-warning ms-1">(capped at 250)</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 3: City Preview Table ── */}
        {computedCities.length > 0 && (
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label fw-semibold mb-0">
                City Preview ({computedCities.length} cities)
                {pinnedCities.length > 0 && (
                  <span className="badge bg-success ms-2" style={{ fontSize: '0.7rem' }}>
                    📌 {pinnedCities.length} pinned
                  </span>
                )}
                {excludedCityIds.size > 0 && (
                  <span className="badge bg-danger ms-1" style={{ fontSize: '0.7rem' }}>
                    {excludedCityIds.size} excluded
                  </span>
                )}
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
            <p className="text-muted small mb-2">
              Top {cityCap} cities per state ranked by population. Pin cities to guarantee inclusion. Exclude cities to remove them.
            </p>
            <div className="table-responsive" style={{ maxHeight: 350, overflowY: 'auto' }}>
              <table className="table table-sm table-striped mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>City</th>
                    <th>State</th>
                    <th className="text-end">Population</th>
                    <th style={{ width: 80 }} className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCities.slice(0, 150).map((city, idx) => {
                    const isPinned = pinnedIds.has(city.id);
                    return (
                      <tr key={`${city.state_code}-${city.id}`}>
                        <td className="text-muted">{idx + 1}</td>
                        <td>
                          {isPinned && <span title="Pinned" style={{ marginRight: 4 }}>📌</span>}
                          {city.name}
                        </td>
                        <td>{city.state_code}</td>
                        <td className="text-end">
                          {city.population ? city.population.toLocaleString() : '—'}
                        </td>
                        <td className="text-center">
                          {isPinned ? (
                            <button
                              className="btn btn-outline-secondary btn-sm py-0 px-1"
                              style={{ fontSize: '0.7rem' }}
                              title="Unpin"
                              onClick={() => unpinCity(city.id)}
                            >
                              Unpin
                            </button>
                          ) : (
                            <button
                              className="btn btn-outline-danger btn-sm py-0 px-1"
                              style={{ fontSize: '0.7rem' }}
                              title="Exclude this city"
                              onClick={() => excludeCity(city.id)}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredCities.length > 150 && (
              <div className="text-muted small text-center mt-1">
                Showing first 150 of {filteredCities.length} cities
              </div>
            )}
          </div>
        )}

        {/* ── Pin a City search ── */}
        {selectedStates.size > 0 && (
          <div className="mb-4">
            <label className="form-label fw-semibold">📌 Pin a City</label>
            <p className="text-muted small mb-2">
              Search for a specific city to force-include it regardless of the per-state cap.
            </p>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Type a city name (min 2 chars)..."
              value={citySearchQuery}
              onChange={e => setCitySearchQuery(e.target.value)}
            />
            {citySearchLoading && (
              <div className="text-muted small mt-1">Searching...</div>
            )}
            {citySearchResults.length > 0 && (
              <div className="border rounded mt-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {citySearchResults.map(city => {
                  const alreadyIncluded = pinnedIds.has(city.id) ||
                    computedCities.some(c => c.id === city.id);
                  return (
                    <div
                      key={city.id}
                      className={`d-flex justify-content-between align-items-center px-3 py-2 border-bottom ${
                        alreadyIncluded ? 'bg-light' : ''
                      }`}
                      style={{ cursor: alreadyIncluded ? 'default' : 'pointer' }}
                      onClick={() => !alreadyIncluded && pinCity(city)}
                    >
                      <div>
                        <strong>{city.name}</strong>, {city.state_code}
                        <span className="text-muted ms-2 small">
                          {city.population ? city.population.toLocaleString() : '—'} pop
                        </span>
                      </div>
                      {alreadyIncluded ? (
                        <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                          Already included
                        </span>
                      ) : (
                        <span className="badge bg-success" style={{ fontSize: '0.65rem' }}>
                          + Pin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Excluded Cities (collapsible) ── */}
        {excludedCityIds.size > 0 && (
          <div className="mb-4">
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowExcluded(!showExcluded)}
            >
              {showExcluded ? '▾' : '▸'} Excluded ({excludedCityIds.size})
            </button>
            {showExcluded && (
              <div className="border rounded mt-2 p-2">
                <div className="d-flex flex-wrap gap-1">
                  {excludedCitiesList.map(city => (
                    <span key={city.id} className="badge bg-danger bg-opacity-75">
                      {city.name}, {city.state_code}
                      <button
                        className="btn-close btn-close-white ms-1"
                        style={{ fontSize: '0.45rem' }}
                        onClick={() => restoreCity(city.id)}
                        title="Restore"
                      />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Coverage Summary ── */}
        <div className="p-3 bg-light rounded">
          <h6 className="mb-2">Coverage Summary</h6>
          <div className="row text-center">
            <div className="col">
              <strong>{selectedStates.size}</strong><br/>
              <small className="text-muted">States</small>
            </div>
            <div className="col">
              <strong>{computedCities.length}</strong><br/>
              <small className="text-muted">Cities</small>
            </div>
            <div className="col">
              <strong>{selectedServiceIds.size}</strong><br/>
              <small className="text-muted">Services</small>
            </div>
            <div className="col bg-white rounded">
              <strong className="text-primary">{totalPages}</strong><br/>
              <small className="fw-semibold">Est. Pages</small>
            </div>
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
                  <tr><td className="text-muted">Cities/State</td><td>{cityCap} (cap)</td></tr>
                  <tr><td className="text-muted">Cities (total)</td><td>{computedCities.length}</td></tr>
                  {pinnedCities.length > 0 && (
                    <tr><td className="text-muted">Pinned</td><td>📌 {pinnedCities.length} ({pinnedCities.map(c => c.name).join(', ')})</td></tr>
                  )}
                  {excludedCityIds.size > 0 && (
                    <tr><td className="text-muted">Excluded</td><td>{excludedCityIds.size} cities</td></tr>
                  )}
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

  // ─── Main Render ──────────────────────────────────────────

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
ENDOFFILE_PAGE

echo "   ✅ Wizard V2 installed"

# ──────────────────────────────────────────────────────────────
# 2. Update brands POST route
# ──────────────────────────────────────────────────────────────
echo "2/3  Updating brands API route..."

cat > apps/admin/src/app/api/brands/route.ts << 'ENDOFFILE_BRANDS'
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/brands
// List all brands/sites with category, template, targeting summary
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const categoryId = searchParams.get('category_id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`s.status = $${paramIdx++}`);
      values.push(status);
    }
    if (categoryId) {
      conditions.push(`s.category_id = $${paramIdx++}`);
      values.push(categoryId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    values.push(limit, offset);

    const result = await pool.query(`
      SELECT 
        s.id,
        s.domain,
        s.brand_name,
        s.status,
        s.indexing_mode,
        s.category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        v.name AS vertical_name,
        t.name AS template_name,
        s.slug_strategy_config,
        s.blog_config,
        s.created_at,
        s.updated_at,
        (SELECT COUNT(*)::int FROM site_target_states ts WHERE ts.site_id = s.id) AS target_states,
        (SELECT COUNT(*)::int FROM site_target_counties tc WHERE tc.site_id = s.id) AS target_counties,
        (SELECT COUNT(*)::int FROM site_target_zips tz WHERE tz.site_id = s.id) AS target_zips,
        (SELECT COUNT(*)::int FROM site_target_cities tci WHERE tci.site_id = s.id) AS target_cities,
        (SELECT COUNT(*)::int FROM site_pages sp WHERE sp.site_id = s.id) AS page_count,
        (SELECT COUNT(*)::int FROM generation_jobs gj WHERE gj.site_id = s.id) AS job_count
      FROM sites s
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN verticals v ON s.vertical_id = v.id
      LEFT JOIN templates t ON s.template_id = t.id
      ${where}
      ORDER BY s.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `, values);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM sites s ${where}`,
      values.slice(0, conditions.length)
    );

    return NextResponse.json({
      brands: result.rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/brands
// Create a new brand with targeting (wizard submit)
export async function POST(request: NextRequest) {
  const client = await (pool as any).connect();

  try {
    const body = await request.json();

    // --- Validate required fields ---
    const errors: string[] = [];
    if (!body.domain || typeof body.domain !== 'string') errors.push('domain is required');
    if (!body.category_id) errors.push('category_id is required');
    if (!body.template_id) errors.push('template_id is required');
    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
    }

    // Check domain uniqueness
    const domainCheck = await client.query(
      'SELECT id FROM sites WHERE domain = $1', [body.domain.toLowerCase()]
    );
    if (domainCheck.rows.length > 0) {
      return NextResponse.json({ error: 'Domain already exists' }, { status: 409 });
    }

    // Verify category exists AND get its vertical_id
    const catCheck = await client.query(
      'SELECT id, vertical_id FROM categories WHERE id = $1',
      [body.category_id]
    );
    if (catCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid category_id' }, { status: 400 });
    }
    const verticalId = catCheck.rows[0].vertical_id;
    if (!verticalId) {
      return NextResponse.json({
        error: 'Category has no vertical assigned. Seed verticals first.',
      }, { status: 400 });
    }

    // Verify template exists
    const tplCheck = await client.query('SELECT id FROM templates WHERE id = $1', [body.template_id]);
    if (tplCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid template_id' }, { status: 400 });
    }

    // V2 targeting params
    const cityCapValue = Math.min(Math.max(body.city_cap || 25, 1), 100);
    const pinnedCityIds: number[] = body.pinned_city_ids || [];
    const excludedCityIds: number[] = body.excluded_city_ids || [];

    await client.query('BEGIN');

    // 1. Create site/brand record — includes vertical_id and uppercase DRAFT
    const siteResult = await client.query(`
      INSERT INTO sites (
        domain, brand_name, category_id, vertical_id, template_id,
        brand_seed, theme_config, target_geo_config,
        slug_strategy_config, blog_config, indexing_mode, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      body.domain.toLowerCase(),
      body.brand_name || null,
      body.category_id,
      verticalId,
      body.template_id,
      JSON.stringify(body.brand_seed || {}),
      JSON.stringify(body.theme_config || {}),
      JSON.stringify({
        ...(body.target_geo_config || {}),
        city_cap: cityCapValue,
        pinned_city_ids: pinnedCityIds,
        excluded_city_ids: excludedCityIds,
      }),
      JSON.stringify(body.slug_strategy_config || {
        money: '/{city-slug}-{state}/{service-slug}',
        service: '/services/{service-slug}',
        city: '/areas/{city-slug}-{state}',
      }),
      JSON.stringify(body.blog_config || { enabled: false }),
      'noindex',
      'DRAFT',
    ]);
    const siteId = siteResult.rows[0].id;

    // 2. Insert service selections (default: all in category)
    const serviceIds: string[] = body.service_ids || [];
    if (serviceIds.length === 0) {
      // Default: select all services in the category
    }

    // 3. Insert geo targeting
    const targetStates: string[] = body.target_states || [];
    const targetCountyIds: number[] = body.target_county_ids || [];
    const targetZips: string[] = body.target_zips || [];

    for (const stateCode of targetStates) {
      await client.query(
        'INSERT INTO site_target_states (site_id, state_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [siteId, stateCode.toUpperCase()]
      );
    }

    for (const countyId of targetCountyIds) {
      await client.query(
        'INSERT INTO site_target_counties (site_id, county_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [siteId, countyId]
      );
    }

    const uniqueZips = [...new Set(targetZips)];
    for (const zip of uniqueZips) {
      await client.query(
        'INSERT INTO site_target_zips (site_id, zip) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [siteId, zip]
      );
    }

    // 4. Derive target cities from targeting selections
    await client.query(`
      INSERT INTO site_target_cities (site_id, city_id, source)
      SELECT DISTINCT $1, c.id, 'state'
      FROM cities c
      INNER JOIN site_target_states ts ON ts.site_id = $1 AND ts.state_code = c.state_code
      WHERE c.is_active = true
      ON CONFLICT (site_id, city_id) DO NOTHING
    `, [siteId]);

    await client.query(`
      INSERT INTO site_target_cities (site_id, city_id, source)
      SELECT DISTINCT $1, c.id, 'county'
      FROM cities c
      INNER JOIN counties co ON co.state_code = c.state_code AND co.name = c.county_name
      INNER JOIN site_target_counties tc ON tc.site_id = $1 AND tc.county_id = co.id
      WHERE c.is_active = true
      ON CONFLICT (site_id, city_id) DO NOTHING
    `, [siteId]);

    await client.query(`
      INSERT INTO site_target_cities (site_id, city_id, source)
      SELECT DISTINCT $1, z.city_id, 'zip'
      FROM zip_codes z
      INNER JOIN site_target_zips tz ON tz.site_id = $1 AND tz.zip = z.zip
      WHERE z.city_id IS NOT NULL
      ON CONFLICT (site_id, city_id) DO NOTHING
    `, [siteId]);

    // 5. V2: Apply pin/exclude to site_target_cities
    // Delete excluded cities
    if (excludedCityIds.length > 0) {
      await client.query(
        'DELETE FROM site_target_cities WHERE site_id = $1 AND city_id = ANY($2::int[])',
        [siteId, excludedCityIds]
      );
    }

    // Insert pinned cities (mark as 'pinned' source)
    for (const cityId of pinnedCityIds) {
      await client.query(`
        INSERT INTO site_target_cities (site_id, city_id, source)
        VALUES ($1, $2, 'pinned')
        ON CONFLICT (site_id, city_id) DO UPDATE SET source = 'pinned'
      `, [siteId, cityId]);
    }

    // 6. Count derived cities and get service count for estimates
    const cityCount = await client.query(
      'SELECT COUNT(*)::int AS count FROM site_target_cities WHERE site_id = $1',
      [siteId]
    );
    const serviceCount = await client.query(
      'SELECT COUNT(*)::int AS count FROM services WHERE category_id = $1 AND is_active = true',
      [body.category_id]
    );

    const derivedCities = cityCount.rows[0].count;
    const activeServices = serviceCount.rows[0].count;

    // Estimate uses the cap (not total derived)
    const cappedCities = Math.min(derivedCities, cityCapValue * targetStates.length);
    const estimatedPages = 1 + activeServices + cappedCities + Math.min(cappedCities * activeServices, 250) + 7 + 1;

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      brand_id: siteId,
      domain: body.domain.toLowerCase(),
      status: 'DRAFT',
      indexing_mode: 'noindex',
      vertical_id: verticalId,
      targeting_summary: {
        states: targetStates.length,
        counties: targetCountyIds.length,
        zips: uniqueZips.length,
        derived_cities: derivedCities,
        city_cap: cityCapValue,
        pinned: pinnedCityIds.length,
        excluded: excludedCityIds.length,
      },
      page_estimate: {
        services: activeServices,
        cities: cappedCities,
        money_pages: Math.min(cappedCities * activeServices, 250),
        total: estimatedPages,
      },
    }, { status: 201 });

  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const detail = (err as { detail?: string }).detail || null;
    return NextResponse.json({ error: msg, detail }, { status: 500 });
  } finally {
    client.release();
  }
}
ENDOFFILE_BRANDS

echo "   ✅ Brands route updated"

# ──────────────────────────────────────────────────────────────
# 3. Update generate-pages route
# ──────────────────────────────────────────────────────────────
echo "3/3  Updating generate-pages route..."

cat > apps/admin/src/app/api/brands/\[id\]/generate-pages/route.ts << 'ENDOFFILE_GENPAGES'
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DEFAULT_MAX_CITIES_PER_STATE = 25;
const DEFAULT_MAX_MONEY_PAGES = 250;

const LEGAL_PAGES = [
  { path: '/about', title: 'About Us', slug: 'about' },
  { path: '/contact', title: 'Contact Us', slug: 'contact' },
  { path: '/faq', title: 'Frequently Asked Questions', slug: 'faq' },
  { path: '/privacy-policy', title: 'Privacy Policy', slug: 'privacy-policy' },
  { path: '/terms-of-service', title: 'Terms of Service', slug: 'terms-of-service' },
  { path: '/thank-you', title: 'Thank You', slug: 'thank-you' },
  { path: '/404', title: 'Page Not Found', slug: '404' },
];

interface SlugStrategy {
  money?: string;
  service?: string;
  city?: string;
}

function buildPath(
  template: string,
  vars: { citySlug?: string; stateCode?: string; serviceSlug?: string }
): string {
  let path = template;
  if (vars.citySlug) path = path.replace('{city-slug}', vars.citySlug);
  if (vars.stateCode) path = path.replace('{state}', vars.stateCode.toLowerCase());
  if (vars.serviceSlug) path = path.replace('{service-slug}', vars.serviceSlug);
  return path;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();

  try {
    const { id: siteId } = await params;

    let maxCitiesPerState = DEFAULT_MAX_CITIES_PER_STATE;
    let maxMoneyPages = DEFAULT_MAX_MONEY_PAGES;
    try {
      const body = await request.json();
      if (body.max_cities_per_state) maxCitiesPerState = Math.min(body.max_cities_per_state, 100);
      if (body.max_money_pages) maxMoneyPages = Math.min(body.max_money_pages, 1000);
    } catch {
      // No body — use defaults
    }

    const siteResult = await client.query(`
      SELECT s.id, s.domain, s.category_id, s.slug_strategy_config, s.blog_config, s.brand_name,
             s.target_geo_config,
             c.name AS category_name, c.slug AS category_slug
      FROM sites s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.id = $1
    `, [siteId]);

    if (siteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const brand = siteResult.rows[0];

    // V2: Read city_cap from target_geo_config as fallback
    const geoConfig = typeof brand.target_geo_config === 'string'
      ? JSON.parse(brand.target_geo_config)
      : (brand.target_geo_config || {});
    if (maxCitiesPerState === DEFAULT_MAX_CITIES_PER_STATE && geoConfig.city_cap) {
      maxCitiesPerState = Math.min(geoConfig.city_cap, 100);
    }

    if (!brand.category_id) {
      return NextResponse.json({ error: 'Brand has no category assigned' }, { status: 400 });
    }

    const existingPages = await client.query(
      'SELECT COUNT(*)::int AS count FROM site_pages WHERE site_id = $1',
      [siteId]
    );
    if (existingPages.rows[0].count > 0) {
      return NextResponse.json({
        error: 'Pages already exist for this brand',
        existing_count: existingPages.rows[0].count,
        hint: 'DELETE existing pages first if you want to regenerate',
      }, { status: 409 });
    }

    const servicesResult = await client.query(`
      SELECT id, name, slug, service_code
      FROM services
      WHERE category_id = $1 AND is_active = true
      ORDER BY sort_order NULLS LAST, name
    `, [brand.category_id]);
    const services = servicesResult.rows;

    if (services.length === 0) {
      return NextResponse.json({ error: 'No active services for this category' }, { status: 400 });
    }

    const citiesResult = await client.query(`
      WITH ranked AS (
        SELECT 
          c.id AS city_id,
          c.name AS city_name,
          c.slug AS city_slug,
          c.state_code,
          c.population,
          tc.source,
          ROW_NUMBER() OVER (
            PARTITION BY c.state_code 
            ORDER BY 
              CASE WHEN tc.source = 'pinned' THEN 0 ELSE 1 END,
              c.population DESC NULLS LAST, c.name ASC
          ) AS rn
        FROM site_target_cities tc
        JOIN cities c ON tc.city_id = c.id
        WHERE tc.site_id = $1
      )
      SELECT city_id, city_name, city_slug, state_code, population, source, rn
      FROM ranked
      WHERE rn <= $2
      ORDER BY state_code, rn
    `, [siteId, maxCitiesPerState]);
    const cities = citiesResult.rows;

    const totalCitiesResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM site_target_cities WHERE site_id = $1',
      [siteId]
    );
    const totalDerivedCities = totalCitiesResult.rows[0].count;

    if (cities.length === 0) {
      return NextResponse.json({ error: 'No target cities found. Create brand with geo targeting first.' }, { status: 400 });
    }

    const slugConfig: SlugStrategy = typeof brand.slug_strategy_config === 'string'
      ? JSON.parse(brand.slug_strategy_config)
      : (brand.slug_strategy_config || {});

    const moneyTemplate = slugConfig.money || '/{city-slug}-{state}/{service-slug}';
    const serviceTemplate = slugConfig.service || '/services/{service-slug}';
    const cityTemplate = slugConfig.city || '/areas/{city-slug}-{state}';

    await client.query('BEGIN');

    const counts: Record<string, number> = {
      HOME: 0, SERVICE: 0, CITY: 0, MONEY: 0, LEGAL: 0, BLOG_INDEX: 0,
    };
    let moneyTrimmed = false;
    const citiesTrimmed = cities.length < totalDerivedCities;
    const populationMissing = cities.some((c: { population: number | null }) => c.population === null);

    await client.query(`
      INSERT INTO site_pages (site_id, page_type, path, title, meta_description, status)
      VALUES ($1, 'HOME', '/', $2, $3, 'draft')
      ON CONFLICT (site_id, path) DO NOTHING
    `, [
      siteId,
      `${brand.brand_name || brand.category_name} - Home`,
      `Professional ${brand.category_name} services. Get a free quote today.`,
    ]);
    counts.HOME = 1;

    for (const svc of services) {
      const path = buildPath(serviceTemplate, { serviceSlug: svc.slug });
      await client.query(`
        INSERT INTO site_pages (site_id, page_type, service_id, path, title, meta_description, status)
        VALUES ($1, 'SERVICE', $2, $3, $4, $5, 'draft')
        ON CONFLICT (site_id, path) DO NOTHING
      `, [
        siteId,
        svc.id,
        path,
        `${svc.name} Services`,
        `Professional ${svc.name.toLowerCase()} services. Licensed, insured, and trusted.`,
      ]);
      counts.SERVICE++;
    }

    for (const city of cities) {
      const path = buildPath(cityTemplate, {
        citySlug: city.city_slug,
        stateCode: city.state_code,
      });
      await client.query(`
        INSERT INTO site_pages (site_id, page_type, city_id, path, title, meta_description, status)
        VALUES ($1, 'CITY', $2, $3, $4, $5, 'draft')
        ON CONFLICT (site_id, path) DO NOTHING
      `, [
        siteId,
        city.city_id,
        path,
        `${brand.category_name} in ${city.city_name}, ${city.state_code}`,
        `Top-rated ${brand.category_name.toLowerCase()} services in ${city.city_name}, ${city.state_code}. Free estimates.`,
      ]);
      counts.CITY++;
    }

    let moneyCount = 0;
    moneyLoop:
    for (const city of cities) {
      for (const svc of services) {
        if (moneyCount >= maxMoneyPages) {
          moneyTrimmed = true;
          break moneyLoop;
        }
        const path = buildPath(moneyTemplate, {
          citySlug: city.city_slug,
          stateCode: city.state_code,
          serviceSlug: svc.slug,
        });
        await client.query(`
          INSERT INTO site_pages (site_id, page_type, service_id, city_id, path, title, meta_description, status)
          VALUES ($1, 'MONEY', $2, $3, $4, $5, $6, 'draft')
          ON CONFLICT (site_id, path) DO NOTHING
        `, [
          siteId,
          svc.id,
          city.city_id,
          path,
          `${svc.name} in ${city.city_name}, ${city.state_code}`,
          `Professional ${svc.name.toLowerCase()} in ${city.city_name}, ${city.state_code}. Licensed & insured. Free quotes.`,
        ]);
        moneyCount++;
      }
    }
    counts.MONEY = moneyCount;

    for (const lp of LEGAL_PAGES) {
      await client.query(`
        INSERT INTO site_pages (site_id, page_type, path, title, status)
        VALUES ($1, 'LEGAL', $2, $3, 'draft')
        ON CONFLICT (site_id, path) DO NOTHING
      `, [siteId, lp.path, lp.title]);
      counts.LEGAL++;
    }

    const blogConfig = typeof brand.blog_config === 'string'
      ? JSON.parse(brand.blog_config)
      : (brand.blog_config || {});

    if (blogConfig.enabled) {
      await client.query(`
        INSERT INTO site_pages (site_id, page_type, path, title, status)
        VALUES ($1, 'BLOG_INDEX', '/blog', 'Blog', 'draft')
        ON CONFLICT (site_id, path) DO NOTHING
      `, [siteId]);
      counts.BLOG_INDEX = 1;
    }

    await client.query('COMMIT');

    const verifyResult = await client.query(`
      SELECT page_type, COUNT(*)::int AS count
      FROM site_pages
      WHERE site_id = $1
      GROUP BY page_type
      ORDER BY page_type
    `, [siteId]);

    const verifiedCounts: Record<string, number> = {};
    let totalCreated = 0;
    for (const row of verifyResult.rows) {
      verifiedCounts[row.page_type] = row.count;
      totalCreated += row.count;
    }

    return NextResponse.json({
      success: true,
      site_id: siteId,
      pages_created: verifiedCounts,
      total: totalCreated,
      caps_applied: {
        max_cities_per_state: maxCitiesPerState,
        max_money_pages: maxMoneyPages,
        cities_before_cap: totalDerivedCities,
        cities_after_cap: cities.length,
        cities_trimmed: citiesTrimmed,
        money_trimmed: moneyTrimmed,
      },
      warnings: [
        ...(populationMissing ? ['Some cities have no population data — ordering fell back to alphabetical. Run population backfill for accurate city ranking.'] : []),
        ...(citiesTrimmed ? [`${totalDerivedCities - cities.length} cities excluded by per-state cap (${maxCitiesPerState}/state)`] : []),
        ...(moneyTrimmed ? [`Money pages capped at ${maxMoneyPages}. ${cities.length * services.length - moneyCount} combinations skipped.`] : []),
      ],
    }, { status: 201 });

  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const detail = (err as { detail?: string }).detail || null;
    return NextResponse.json({ error: msg, detail }, { status: 500 });
  } finally {
    client.release();
  }
}
ENDOFFILE_GENPAGES

echo "   ✅ Generate-pages route updated"

echo ""
echo "=== V2 Targeting Installation Complete ==="
echo ""
echo "Files updated:"
echo "  ✅ apps/admin/src/app/brands/new/page.tsx           (Wizard V2)"
echo "  ✅ apps/admin/src/app/api/brands/route.ts           (city_cap, pin, exclude)"
echo "  ✅ apps/admin/src/app/api/brands/[id]/generate-pages/route.ts (pinned-first)"
echo ""
echo "Changes:"
echo "  • Step 3 redesigned: removed counties & ZIPs, added city cap dropdown"
echo "  • Pin cities: search & force-include specific cities"
echo "  • Exclude cities: remove cities from the list"
echo "  • City cap: 25/50/100 cities per state (default 25)"
echo "  • Generate-pages: pinned cities rank first, reads cap from brand config"
echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'feat: v2 targeting - city cap, pin/exclude cities, simplified Step 3'"
echo "  git push origin main"
echo ""
echo "CI/CD will deploy to staging automatically."
