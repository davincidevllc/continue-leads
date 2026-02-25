import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/geo/cities?state=MA&county=Suffolk&q=bos&limit=50&sort=population
// Search/filter cities with optional state, county, and text query
// sort=population → ORDER BY population DESC (matches generate-pages ranking)
// sort=name (default) → ORDER BY name ASC
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state')?.toUpperCase();
    const county = searchParams.get('county');
    const q = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);
    const sort = searchParams.get('sort');

    const conditions: string[] = ['c.is_active = true'];
    const values: any[] = [];
    let paramIdx = 1;

    if (state) {
      conditions.push(`c.state_code = $${paramIdx++}`);
      values.push(state);
    }
    if (county) {
      conditions.push(`c.county_name ILIKE $${paramIdx++}`);
      values.push(county);
    }
    if (q && q.length >= 2) {
      conditions.push(`c.name ILIKE $${paramIdx++}`);
      values.push(`${q}%`);
    }

    if (!state && !q) {
      return NextResponse.json(
        { error: 'Provide at least state or q (min 2 chars) parameter' },
        { status: 400 }
      );
    }

    values.push(limit);

    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.slug,
        c.state_code,
        c.county_name,
        c.lat,
        c.lng,
        c.population,
        (SELECT COUNT(*)::int FROM zip_codes z WHERE z.city_id = c.id) AS zip_count
      FROM cities c
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sort === 'population' ? 'c.population DESC NULLS LAST, c.name ASC' : 'c.name ASC'}
      LIMIT $${paramIdx}
    `, values);

    return NextResponse.json({
      cities: result.rows,
      total: result.rows.length,
      filters: { state, county, q, limit, sort: sort || 'name' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

