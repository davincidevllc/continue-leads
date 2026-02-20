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

    // 1. Add "Home Improvement" to verticals (the REAL vertical/industry)
    const existingHI = await directPool.query(
      "SELECT id FROM verticals WHERE slug = 'home-improvement'"
    );
    let homeImprovementId: string;
    if (existingHI.rows.length === 0) {
      const inserted = await directPool.query(
        "INSERT INTO verticals (name, slug, is_active) VALUES ('Home Improvement', 'home-improvement', true) RETURNING id"
      );
      homeImprovementId = inserted.rows[0].id;
      results.push('Created Home Improvement vertical: ' + homeImprovementId);
    } else {
      homeImprovementId = existingHI.rows[0].id;
      results.push('Home Improvement vertical already exists: ' + homeImprovementId);
    }

    // 2. Make sure all categories point to Home Improvement
    const catUpdate = await directPool.query(
      'UPDATE categories SET vertical_id = $1 WHERE vertical_id IS NULL OR vertical_id != $1',
      [homeImprovementId]
    );
    results.push('Updated ' + catUpdate.rowCount + ' categories to point to Home Improvement');

    // 3. Add missing columns to sites
    const newCols = [
      { name: 'brand_name', sql: "ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255)" },
      { name: 'brand_seed', sql: "ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_seed JSONB DEFAULT '{}'" },
      { name: 'theme_config', sql: "ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}'" },
      { name: 'target_geo_config', sql: "ALTER TABLE sites ADD COLUMN IF NOT EXISTS target_geo_config JSONB DEFAULT '{\"type\": \"metro\"}'" },
      { name: 'blog_config', sql: "ALTER TABLE sites ADD COLUMN IF NOT EXISTS blog_config JSONB DEFAULT '{\"enabled\": true, \"post_frequency\": \"weekly\"}'" },
      { name: 'indexing_mode', sql: "ALTER TABLE sites ADD COLUMN IF NOT EXISTS indexing_mode VARCHAR(20) DEFAULT 'noindex'" },
    ];
    for (const col of newCols) {
      await directPool.query(col.sql);
      results.push('Added column sites.' + col.name);
    }

    // 4. Create blog_posts table
    await directPool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        slug VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        excerpt TEXT,
        content_blocks JSONB NOT NULL DEFAULT '[]',
        meta_description VARCHAR(500),
        status VARCHAR(50) DEFAULT 'draft',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(site_id, slug)
      )
    `);
    results.push('Created blog_posts table');

    // 5. Add indexes
    await directPool.query('CREATE INDEX IF NOT EXISTS idx_blog_posts_site_id ON blog_posts(site_id)');
    await directPool.query('CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status)');
    await directPool.query('CREATE INDEX IF NOT EXISTS idx_sites_indexing_mode ON sites(indexing_mode)');
    results.push('Created indexes');

    // VERIFICATION
    const verts = await directPool.query('SELECT id, name, slug FROM verticals ORDER BY name');
    const cats = await directPool.query(
      'SELECT c.name, c.slug, v.name as vertical_name FROM categories c LEFT JOIN verticals v ON c.vertical_id = v.id ORDER BY c.name'
    );
    const siteCols = await directPool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'sites' AND column_name IN ('brand_name','brand_seed','target_geo_config','blog_config','indexing_mode') ORDER BY column_name"
    );
    const blogTable = await directPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'blog_posts'"
    );

    return NextResponse.json({
      success: true,
      steps: results,
      verification: {
        verticals: verts.rows,
        categories_with_vertical: cats.rows,
        new_site_columns: siteCols.rows.map((r: any) => r.column_name),
        blog_posts_table_exists: blogTable.rows.length > 0,
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
