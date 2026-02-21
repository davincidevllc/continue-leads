import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: 'No auth secret configured' }, { status: 500 });

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sql = await request.text();
  if (!sql || sql.trim().length < 10) {
    return NextResponse.json({ error: 'No SQL provided' }, { status: 400 });
  }

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'continueleads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const start = Date.now();
    await pool.query(sql);
    const elapsed = Date.now() - start;

    const [catCount] = (await pool.query('SELECT COUNT(*)::int AS count FROM categories')).rows;
    const [svcCount] = (await pool.query('SELECT COUNT(*)::int AS count FROM services')).rows;
    const [qsCount] = (await pool.query('SELECT COUNT(*)::int AS count FROM question_sets')).rows;

    return NextResponse.json({
      success: true,
      elapsed_ms: elapsed,
      counts: { categories: catCount.count, services: svcCount.count, question_sets: qsCount.count },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const detail = (err as { detail?: string }).detail || null;
    return NextResponse.json({ success: false, error: msg, detail }, { status: 500 });
  } finally {
    await pool.end();
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ status: 'ready' });
}
