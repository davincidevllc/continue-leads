import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/geo/states
// Returns all US states with city/county/zip counts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const withCounts = searchParams.get('counts') !== 'false';

    let result;
    if (withCounts) {
      result = await pool.query(`
        SELECT 
          s.code,
          s.name,
          s.fips,
          (SELECT COUNT(*)::int FROM counties c WHERE c.state_code = s.code) AS county_count,
          (SELECT COUNT(*)::int FROM cities ct WHERE ct.state_code = s.code) AS city_count,
          (SELECT COUNT(*)::int FROM zip_codes z WHERE z.state_code = s.code) AS zip_count
        FROM states s
        WHERE s.is_active = true
        ORDER BY s.name
      `);
    } else {
      result = await pool.query(`
        SELECT code, name, fips
        FROM states
        WHERE is_active = true
        ORDER BY name
      `);
    }

    return NextResponse.json({
      states: result.rows,
      total: result.rows.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

