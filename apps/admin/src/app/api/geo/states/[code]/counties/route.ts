import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/geo/states/[code]/counties
// Returns all counties for a given state
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const stateCode = code.toUpperCase();

    // Verify state exists
    const state = await pool.query(
      'SELECT code, name FROM states WHERE code = $1',
      [stateCode]
    );
    if (state.rows.length === 0) {
      return NextResponse.json({ error: 'State not found' }, { status: 404 });
    }

    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.slug,
        (SELECT COUNT(*)::int FROM cities ct WHERE ct.county_name = c.name AND ct.state_code = c.state_code) AS city_count,
        (SELECT COUNT(*)::int FROM zip_codes z WHERE z.county_name = c.name AND z.state_code = c.state_code) AS zip_count
      FROM counties c
      WHERE c.state_code = $1 AND c.is_active = true
      ORDER BY c.name
    `, [stateCode]);

    return NextResponse.json({
      state: state.rows[0],
      counties: result.rows,
      total: result.rows.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

