import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: 'No auth secret configured' }, { status: 500 });
  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sql = await request.text();
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'continueleads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const start = Date.now();
    const result = await pool.query(sql);
    const elapsed = Date.now() - start;
    return NextResponse.json({ success: true, elapsed_ms: elapsed, rows: result.rows || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally { await pool.end(); }
}
