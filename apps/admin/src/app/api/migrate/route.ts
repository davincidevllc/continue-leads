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
    const result = await directPool.query(
      `SELECT s.slug as service_slug, s.name as service_name, 
              c.slug as category_slug, c.name as category_name
       FROM services s
       JOIN categories c ON s.category_id = c.id
       ORDER BY c.name, s.name`
    );
    return NextResponse.json({ services: result.rows });
  } finally {
    await directPool.end();
  }
}
