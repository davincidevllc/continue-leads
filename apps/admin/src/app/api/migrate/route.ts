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

    const results: Record<string, any> = {};

    // Get columns for each lead-related table
    const leadTables = [
      'leads', 'lead_contacts', 'lead_consents', 'lead_attributions',
      'lead_details', 'lead_dedupe_claims', 'lead_status_events'
    ];

    for (const table of leadTables) {
      const cols = await directPool.query(
        `SELECT column_name, data_type, column_default, is_nullable
         FROM information_schema.columns 
         WHERE table_name = $1 
         ORDER BY ordinal_position`,
        [table]
      );
      results[table] = cols.rows;
    }

    // Also get sites columns for reference
    const sitesCols = await directPool.query(
      `SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_name = 'sites' ORDER BY ordinal_position`
    );
    results['sites'] = sitesCols.rows;

    // Check constraints on lead_dedupe_claims
    const constraints = await directPool.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) as definition
       FROM pg_constraint 
       WHERE conrelid = 'lead_dedupe_claims'::regclass`
    );
    results['dedupe_constraints'] = constraints.rows;

    return NextResponse.json({ success: true, schema: results });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      detail: error.detail || null
    }, { status: 500 });
  } finally {
    await directPool.end();
  }
}
