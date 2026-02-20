import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json();
  if (body.secret !== process.env.ADMIN_AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const directPool: any = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'continueleads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 3, ssl: { rejectUnauthorized: false },
  });
  try {
    const constraints = await directPool.query(
      `SELECT conname, pg_get_constraintdef(oid) as definition
       FROM pg_constraint 
       WHERE conrelid = 'leads'::regclass AND contype = 'c'`
    );
    const dedupeWindow = await directPool.query(
      `SELECT column_name, data_type, column_default FROM information_schema.columns 
       WHERE table_name = 'categories' AND column_name LIKE '%dedupe%'`
    );
    return NextResponse.json({ 
      lead_constraints: constraints.rows,
      category_dedupe_columns: dedupeWindow.rows
    });
  } finally {
    await directPool.end();
  }
}
