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

    // First, let's see what we already have
    const tables = await directPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    results.push('Existing tables: ' + tables.rows.map((r: any) => r.table_name).join(', '));

    // Check what columns sites already has
    const sitesCols = await directPool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'sites' ORDER BY ordinal_position
    `);
    results.push('Sites columns: ' + sitesCols.rows.map((r: any) => r.column_name).join(', '));

    // Check verticals
    const verts = await directPool.query('SELECT id, name, slug FROM verticals');
    results.push('Verticals: ' + JSON.stringify(verts.rows));

    // Check categories
    const cats = await directPool.query('SELECT id, name, slug FROM categories');
    results.push('Categories: ' + JSON.stringify(cats.rows));

    // Check services
    const svcs = await directPool.query('SELECT id, name, slug, category_id FROM services');
    results.push('Services: ' + JSON.stringify(svcs.rows));

    // Check metros
    const metros = await directPool.query('SELECT id, name, slug, state FROM metros');
    results.push('Metros: ' + JSON.stringify(metros.rows));

    return NextResponse.json({ success: true, audit: results });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      detail: error.detail || null 
    }, { status: 500 });
  } finally {
    await directPool.end();
  }
}
