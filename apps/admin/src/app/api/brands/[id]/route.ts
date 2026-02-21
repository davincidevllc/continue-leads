import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/brands/[id]
// Returns full brand detail with targeting, pages, jobs, QA summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Main brand/site record
    const site = await pool.query(`
      SELECT 
        s.*,
        c.name AS category_name,
        c.slug AS category_slug,
        t.name AS template_name
      FROM sites s
      LEFT JOIN categories c ON s.category_id = c.id
      LEFT JOIN templates t ON s.template_id = t.id
      WHERE s.id = $1
    `, [id]);

    if (site.rows.length === 0) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const brand = site.rows[0];

    // Targeting summary
    const [targetStates, targetCounties, targetZips, targetCities] = await Promise.all([
      pool.query(`
        SELECT ts.state_code, st.name AS state_name 
        FROM site_target_states ts 
        JOIN states st ON ts.state_code = st.code 
        WHERE ts.site_id = $1 ORDER BY st.name
      `, [id]),
      pool.query(`
        SELECT tc.county_id, co.name AS county_name, co.state_code
        FROM site_target_counties tc
        JOIN counties co ON tc.county_id = co.id
        WHERE tc.site_id = $1 ORDER BY co.state_code, co.name
      `, [id]),
      pool.query(`
        SELECT tz.zip, z.city_slug, z.state_code, c.name AS city_name
        FROM site_target_zips tz
        LEFT JOIN zip_codes z ON tz.zip = z.zip
        LEFT JOIN cities c ON z.city_id = c.id
        WHERE tz.site_id = $1 ORDER BY tz.zip
      `, [id]),
      pool.query(`
        SELECT tc.city_id, tc.source, c.name AS city_name, c.state_code, c.slug AS city_slug
        FROM site_target_cities tc
        JOIN cities c ON tc.city_id = c.id
        WHERE tc.site_id = $1 ORDER BY c.state_code, c.name
        LIMIT 500
      `, [id]),
    ]);

    // Services for this brand's category
    const services = await pool.query(`
      SELECT id, name, slug, is_active, service_code
      FROM services 
      WHERE category_id = $1 
      ORDER BY sort_order NULLS LAST, name
    `, [brand.category_id]);

    // Page counts by type
    const pageCounts = await pool.query(`
      SELECT page_type, status, COUNT(*)::int AS count
      FROM site_pages
      WHERE site_id = $1
      GROUP BY page_type, status
      ORDER BY page_type, status
    `, [id]);

    // Recent jobs
    const jobs = await pool.query(`
      SELECT id, job_type, status, total_items, completed_items, failed_items,
             started_at, completed_at, created_at
      FROM generation_jobs
      WHERE site_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [id]);

    // Latest QA run
    const qaRun = await pool.query(`
      SELECT id, scope, status, total_pages, pages_passed, pages_warned, pages_failed,
             override_approved, override_reason, completed_at
      FROM qa_runs
      WHERE site_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [id]);

    // Overlap warnings: other brands targeting same cities
    const overlapCheck = await pool.query(`
      SELECT s.id, s.domain, s.brand_name, COUNT(*)::int AS overlapping_cities
      FROM site_target_cities otc
      JOIN sites s ON otc.site_id = s.id
      WHERE otc.city_id IN (SELECT city_id FROM site_target_cities WHERE site_id = $1)
        AND otc.site_id != $1
      GROUP BY s.id, s.domain, s.brand_name
      ORDER BY overlapping_cities DESC
      LIMIT 10
    `, [id]);

    return NextResponse.json({
      brand,
      targeting: {
        states: targetStates.rows,
        counties: targetCounties.rows,
        zips: targetZips.rows,
        cities: targetCities.rows,
        city_total: targetCities.rows.length,
      },
      services: services.rows,
      pages: pageCounts.rows,
      jobs: jobs.rows,
      latest_qa: qaRun.rows[0] || null,
      overlaps: overlapCheck.rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

