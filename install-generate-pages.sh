#!/bin/bash
# Install generate-pages API route
# Run from repo root: ~/Downloads/continue-leads

set -e

echo "=== Installing POST /api/brands/[id]/generate-pages ==="

# Create directory
mkdir -p apps/admin/src/app/api/brands/\[id\]/generate-pages

# Write the route file
cat > apps/admin/src/app/api/brands/\[id\]/generate-pages/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Caps from Wave 1 addendum
const DEFAULT_MAX_CITIES_PER_STATE = 25;
const DEFAULT_MAX_MONEY_PAGES = 250;

// Legal / legitimacy pages to auto-create
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

// POST /api/brands/[id]/generate-pages
// Creates site_pages inventory rows (empty shells) for all page types
// Enforces city cap (25/state) and money page cap (250 total)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();

  try {
    const { id: siteId } = await params;

    // Optional overrides from request body
    let maxCitiesPerState = DEFAULT_MAX_CITIES_PER_STATE;
    let maxMoneyPages = DEFAULT_MAX_MONEY_PAGES;
    try {
      const body = await request.json();
      if (body.max_cities_per_state) maxCitiesPerState = Math.min(body.max_cities_per_state, 100);
      if (body.max_money_pages) maxMoneyPages = Math.min(body.max_money_pages, 1000);
    } catch {
      // No body or invalid JSON — use defaults
    }

    // 1. Fetch brand record
    const siteResult = await client.query(`
      SELECT s.id, s.domain, s.category_id, s.slug_strategy_config, s.blog_config, s.brand_name,
             c.name AS category_name, c.slug AS category_slug
      FROM sites s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.id = $1
    `, [siteId]);

    if (siteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const brand = siteResult.rows[0];

    if (!brand.category_id) {
      return NextResponse.json({ error: 'Brand has no category assigned' }, { status: 400 });
    }

    // 2. Check for existing pages (idempotency guard)
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

    // 3. Fetch active services for this category
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

    // 4. Fetch target cities grouped by state, ordered by population DESC (name ASC fallback)
    //    Apply per-state cap using ROW_NUMBER window function
    const citiesResult = await client.query(`
      WITH ranked AS (
        SELECT 
          c.id AS city_id,
          c.name AS city_name,
          c.slug AS city_slug,
          c.state_code,
          c.population,
          ROW_NUMBER() OVER (
            PARTITION BY c.state_code 
            ORDER BY c.population DESC NULLS LAST, c.name ASC
          ) AS rn
        FROM site_target_cities tc
        JOIN cities c ON tc.city_id = c.id
        WHERE tc.site_id = $1
      )
      SELECT city_id, city_name, city_slug, state_code, population, rn
      FROM ranked
      WHERE rn <= $2
      ORDER BY state_code, rn
    `, [siteId, maxCitiesPerState]);
    const cities = citiesResult.rows;

    // Total count before cap
    const totalCitiesResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM site_target_cities WHERE site_id = $1',
      [siteId]
    );
    const totalDerivedCities = totalCitiesResult.rows[0].count;

    if (cities.length === 0) {
      return NextResponse.json({ error: 'No target cities found. Create brand with geo targeting first.' }, { status: 400 });
    }

    // 5. Parse slug strategy
    const slugConfig: SlugStrategy = typeof brand.slug_strategy_config === 'string'
      ? JSON.parse(brand.slug_strategy_config)
      : (brand.slug_strategy_config || {});

    const moneyTemplate = slugConfig.money || '/{city-slug}-{state}/{service-slug}';
    const serviceTemplate = slugConfig.service || '/services/{service-slug}';
    const cityTemplate = slugConfig.city || '/areas/{city-slug}-{state}';

    // 6. Build page inventory in a transaction
    await client.query('BEGIN');

    const counts: Record<string, number> = {
      HOME: 0, SERVICE: 0, CITY: 0, MONEY: 0, LEGAL: 0, BLOG_INDEX: 0,
    };
    let moneyTrimmed = false;
    const citiesTrimmed = cities.length < totalDerivedCities;
    const populationMissing = cities.some((c: { population: number | null }) => c.population === null);

    // --- HOME page ---
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

    // --- SERVICE pages ---
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

    // --- CITY pages ---
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

    // --- MONEY pages (city × service, capped at maxMoneyPages) ---
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

    // --- LEGAL / legitimacy pages ---
    for (const lp of LEGAL_PAGES) {
      await client.query(`
        INSERT INTO site_pages (site_id, page_type, path, title, status)
        VALUES ($1, 'LEGAL', $2, $3, 'draft')
        ON CONFLICT (site_id, path) DO NOTHING
      `, [siteId, lp.path, lp.title]);
      counts.LEGAL++;
    }

    // --- BLOG_INDEX (if blog enabled) ---
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

    // 7. Final count verification from DB
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
ENDOFFILE

echo "✅ Route created: apps/admin/src/app/api/brands/[id]/generate-pages/route.ts"

# Verify the file exists
ls -la apps/admin/src/app/api/brands/\[id\]/generate-pages/route.ts

echo ""
echo "=== Next steps ==="
echo "1. git add ."
echo "2. git commit -m 'feat: POST /api/brands/[id]/generate-pages - page inventory with cap enforcement'"
echo "3. git push origin main"
echo "4. Wait for deploy, then test with:"
echo '   curl -s -X POST http://cl-stg-admin-alb-1165576223.us-east-1.elb.amazonaws.com/api/brands/<BRAND_ID>/generate-pages | python3 -m json.tool'
