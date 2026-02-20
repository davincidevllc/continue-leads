import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const directPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'continueleads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const body = await request.json();
    if (body.secret !== process.env.ADMIN_AUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: string[] = [];
    const homeImpId = '7cbbee1b-7078-49d9-b16c-1301053a3286';
    const oldVerticalIds = [
      '20bf7edf-2705-4561-a757-6e66ef082fa2',
      'e3e6cc92-2bc5-43e1-add6-bff189367ca0',
      '5773d904-99e5-4a8c-81bf-565b091ea1eb'
    ];

    // 1. Update any sites pointing to old verticals → Home Improvement
    const siteUpdate = await directPool.query(
      'UPDATE sites SET vertical_id = $1 WHERE vertical_id = ANY($2)',
      [homeImpId, oldVerticalIds]
    );
    results.push('Updated ' + siteUpdate.rowCount + ' sites to Home Improvement');

    // 2. Delete old verticals (Interior Painting, Residential Cleaning, Siding)
    const delResult = await directPool.query(
      'DELETE FROM verticals WHERE id = ANY($1)',
      [oldVerticalIds]
    );
    results.push('Deleted ' + delResult.rowCount + ' old verticals');

    // Verification
    const verts = await directPool.query('SELECT id, name, slug FROM verticals ORDER BY name');

    return NextResponse.json({
      success: true,
      steps: results,
      verification: {
        verticals_remaining: verts.rows
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      detail: error.detail || null
    }, { status: 500 });
  } finally {
    await directPool.end();
  }
}
