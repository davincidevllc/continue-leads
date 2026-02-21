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
    const values: any[] = [];
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
  const client = await pool.connect();

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

    // Verify category exists
    const catCheck = await client.query('SELECT id FROM categories WHERE id = $1', [body.category_id]);
    if (catCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid category_id' }, { status: 400 });
    }

    // Verify template exists
    const tplCheck = await client.query('SELECT id FROM templates WHERE id = $1', [body.template_id]);
    if (tplCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid template_id' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Create site/brand record
    const siteResult = await client.query(`
      INSERT INTO sites (
        domain, brand_name, category_id, template_id,
        brand_seed, theme_config, target_geo_config,
        slug_strategy_config, blog_config, indexing_mode, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      body.domain.toLowerCase(),
      body.brand_name || null,
      body.category_id,
      body.template_id,
      JSON.stringify(body.brand_seed || {}),
      JSON.stringify(body.theme_config || {}),
      JSON.stringify(body.target_geo_config || {}),
      JSON.stringify(body.slug_strategy_config || {
        money: '/{city-slug}-{state}/{service-slug}',
        service: '/services/{service-slug}',
        city: '/areas/{city-slug}-{state}',
      }),
      JSON.stringify(body.blog_config || { enabled: false }),
      'noindex',
      'draft',
    ]);
    const siteId = siteResult.rows[0].id;

    // 2. Insert service selections (default: all in category)
    const serviceIds: string[] = body.service_ids || [];
    if (serviceIds.length === 0) {
      // Default: select all services in the category
      // No separate table needed — query services by category_id at generation time
    }
    // Future: site_services junction table if needed

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

    // Dedupe zips within this brand
    const uniqueZips = [...new Set(targetZips)];
    for (const zip of uniqueZips) {
      await client.query(
        'INSERT INTO site_target_zips (site_id, zip) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [siteId, zip]
      );
    }

    // 4. Derive target cities from targeting selections
    // Union of: cities in selected states + cities in selected counties + primary city of selected zips
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

    // 5. Count derived cities and get service count for estimates
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

    // Page estimate: home(1) + services(N) + cities(C) + money(C*N) + legal(3)
    const estimatedPages = 1 + activeServices + derivedCities + (derivedCities * activeServices) + 3;

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      brand_id: siteId,
      domain: body.domain.toLowerCase(),
      status: 'draft',
      indexing_mode: 'noindex',
      targeting_summary: {
        states: targetStates.length,
        counties: targetCountyIds.length,
        zips: uniqueZips.length,
        derived_cities: derivedCities,
      },
      page_estimate: {
        services: activeServices,
        cities: derivedCities,
        money_pages: derivedCities * activeServices,
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

