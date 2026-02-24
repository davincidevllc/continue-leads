import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

// DELETE /api/brands/[id]/pages
// Wipe all site_pages for a brand so you can regenerate cleanly.
// Requires typed confirmation: { "confirm": "DELETE" }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;

    // Validate confirmation
    let body: { confirm?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body required with { "confirm": "DELETE" }' },
        { status: 400 }
      );
    }

    if (body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" } in request body.' },
        { status: 400 }
      );
    }

    // Verify brand exists
    const brandCheck = await pool.query('SELECT id, domain FROM sites WHERE id = $1', [siteId]);
    if (brandCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Get counts by page_type before deleting
    const countsBefore = await pool.query(`
      SELECT page_type, COUNT(*)::int AS count
      FROM site_pages
      WHERE site_id = $1
      GROUP BY page_type
      ORDER BY page_type
    `, [siteId]);

    const breakdown: Record<string, number> = {};
    let totalDeleted = 0;
    for (const row of countsBefore.rows) {
      breakdown[row.page_type] = row.count;
      totalDeleted += row.count;
    }

    // Delete all pages
    await pool.query('DELETE FROM site_pages WHERE site_id = $1', [siteId]);

    return NextResponse.json({
      success: true,
      site_id: siteId,
      domain: brandCheck.rows[0].domain,
      deleted: breakdown,
      total_deleted: totalDeleted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
