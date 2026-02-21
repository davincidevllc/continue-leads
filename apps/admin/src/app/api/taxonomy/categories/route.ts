import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/taxonomy/categories
// Returns all categories with service counts, grouped by vertical
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';

    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.slug,
        c.is_active,
        c.first_question,
        c.second_question,
        v.name AS vertical_name,
        v.slug AS vertical_slug,
        COUNT(s.id)::int AS service_count
      FROM categories c
      LEFT JOIN verticals v ON c.vertical_id = v.id
      LEFT JOIN services s ON s.category_id = c.id ${activeOnly ? "AND s.is_active = true" : ""}
      ${activeOnly ? "WHERE c.is_active = true" : ""}
      GROUP BY c.id, c.name, c.slug, c.is_active, c.first_question, c.second_question, v.name, v.slug
      ORDER BY c.name
    `);

    return NextResponse.json({
      categories: result.rows,
      total: result.rows.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

