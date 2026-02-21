import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// GET /api/taxonomy/categories/[id]/services
// Returns all services for a given category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify category exists
    const cat = await pool.query(
      'SELECT id, name, slug FROM categories WHERE id = $1',
      [id]
    );
    if (cat.rows.length === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.slug,
        s.service_code,
        s.is_active,
        s.is_popular,
        s.sort_order,
        (SELECT COUNT(*)::int FROM question_sets qs WHERE qs.service_id = s.id) AS question_set_count
      FROM services s
      WHERE s.category_id = $1
      ORDER BY s.sort_order NULLS LAST, s.name
    `, [id]);

    return NextResponse.json({
      category: cat.rows[0],
      services: result.rows,
      total: result.rows.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

