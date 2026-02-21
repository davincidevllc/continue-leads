import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/geo/zips?state=MA&city_id=123&q=021&limit=100
// Search/filter ZIP codes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state')?.toUpperCase();
    const cityId = searchParams.get('city_id');
    const q = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);

    const conditions: string[] = ['z.is_active = true'];
    const values: any[] = [];
    let paramIdx = 1;

    if (state) {
      conditions.push(`z.state_code = $${paramIdx++}`);
      values.push(state);
    }
    if (cityId) {
      conditions.push(`z.city_id = $${paramIdx++}`);
      values.push(parseInt(cityId));
    }
    if (q && q.length >= 2) {
      conditions.push(`z.zip LIKE $${paramIdx++}`);
      values.push(`${q}%`);
    }

    if (!state && !cityId && !q) {
      return NextResponse.json(
        { error: 'Provide at least state, city_id, or q parameter' },
        { status: 400 }
      );
    }

    values.push(limit);

    const result = await pool.query(`
      SELECT 
        z.zip,
        z.state_code,
        z.city_slug,
        z.county_name,
        z.city_id,
        c.name AS city_name
      FROM zip_codes z
      LEFT JOIN cities c ON z.city_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY z.zip
      LIMIT $${paramIdx}
    `, values);

    return NextResponse.json({
      zips: result.rows,
      total: result.rows.length,
      filters: { state, city_id: cityId, q, limit },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

