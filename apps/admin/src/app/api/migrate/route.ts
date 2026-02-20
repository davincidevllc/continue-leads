import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // Simple auth check — must pass the admin secret
    const body = await request.json();
    if (body.secret !== process.env.ADMIN_AUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: string[] = [];

    // STEP 1: Rename verticals → categories
    await pool.query(`ALTER TABLE IF EXISTS verticals RENAME TO categories`);
    results.push('Renamed verticals → categories');

    // STEP 2: Create verticals (industry) table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verticals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    results.push('Created verticals (industry) table');

    // STEP 3: Add vertical_id to categories
    await pool.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS vertical_id UUID`);
    results.push('Added vertical_id to categories');

    // STEP 4: Create services table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    results.push('Created services table');

    // STEP 5: Create service_types table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_id UUID NOT NULL,
        slug VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(service_id, slug)
      )
    `);
    results.push('Created service_types table');

    // STEP 6: Create question_sets + question_set_versions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS question_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID NOT NULL,
        service_id UUID,
        service_type_id UUID,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS question_set_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_set_id UUID NOT NULL,
        version_num INTEGER NOT NULL DEFAULT 1,
        schema_json JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(question_set_id, version_num)
      )
    `);
    results.push('Created question_sets + question_set_versions tables');

    // STEP 7: Create blog_posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id UUID NOT NULL,
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

    // STEP 8: Update sites table
    // Rename vertical_id → category_id if needed
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'sites' AND column_name = 'vertical_id'
    `);
    if (colCheck.rows.length > 0) {
      const catColCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'sites' AND column_name = 'category_id'
      `);
      if (catColCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE sites RENAME COLUMN vertical_id TO category_id`);
        results.push('Renamed sites.vertical_id → category_id');
      }
    }
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS category_id UUID`);
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255)`);
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_seed JSONB DEFAULT '{}'`);
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}'`);
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS target_geo_config JSONB DEFAULT '{"type": "metro"}'`);
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS blog_config JSONB DEFAULT '{"enabled": true, "post_frequency": "weekly"}'`);
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS indexing_mode VARCHAR(20) DEFAULT 'noindex'`);
    results.push('Added new columns to sites');

    // STEP 9: Seed data
    // Seed Home Improvement vertical
    await pool.query(`
      INSERT INTO verticals (id, slug, name, status)
      VALUES ('a1b2c3d4-0001-4000-8000-000000000001', 'home-improvement', 'Home Improvement', 'active')
      ON CONFLICT (slug) DO NOTHING
    `);
    results.push('Seeded Home Improvement vertical');

    // Link categories to vertical
    await pool.query(`
      UPDATE categories 
      SET vertical_id = 'a1b2c3d4-0001-4000-8000-000000000001'
      WHERE vertical_id IS NULL
    `);
    results.push('Linked categories to Home Improvement');

    // Seed services
    const catRows = await pool.query(`SELECT id, slug FROM categories`);
    const cats: Record<string, string> = {};
    for (const row of catRows.rows) {
      cats[row.slug] = row.id;
    }

    if (cats['painting']) {
      await pool.query(`
        INSERT INTO services (category_id, slug, name) VALUES
          ($1, 'interior-painting', 'Interior Painting'),
          ($1, 'exterior-painting', 'Exterior Painting'),
          ($1, 'commercial-painting', 'Commercial Painting'),
          ($1, 'popcorn-ceiling-removal', 'Popcorn Ceiling Removal'),
          ($1, 'specialty-painting-faux-finishes', 'Specialty Painting - Faux Finishes'),
          ($1, 'wallpaper-install', 'Wallpaper Install'),
          ($1, 'wallpaper-removal', 'Wallpaper Removal')
        ON CONFLICT (slug) DO NOTHING
      `, [cats['painting']]);
      results.push('Seeded Painting services (7)');
    }

    if (cats['cleaning']) {
      await pool.query(`
        INSERT INTO services (category_id, slug, name) VALUES
          ($1, 'house-cleaning', 'House Cleaning'),
          ($1, 'office-cleaning', 'Office Cleaning'),
          ($1, 'upholstery-cleaning', 'Upholstery Cleaning')
        ON CONFLICT (slug) DO NOTHING
      `, [cats['cleaning']]);
      results.push('Seeded Cleaning services (3)');
    }

    if (cats['siding']) {
      await pool.query(`
        INSERT INTO services (category_id, slug, name) VALUES
          ($1, 'vinyl-siding', 'Vinyl Siding'),
          ($1, 'stucco-siding', 'Stucco Siding'),
          ($1, 'composite-wood-siding', 'Composite Wood Siding'),
          ($1, 'brick-or-stone-siding', 'Brick or Stone Siding'),
          ($1, 'stone-siding', 'Stone Siding'),
          ($1, 'aluminium-siding', 'Aluminium Siding')
        ON CONFLICT (slug) DO NOTHING
      `, [cats['siding']]);
      results.push('Seeded Siding services (6)');
    }

    // STEP 10: Add indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_categories_vertical_id ON categories(vertical_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blog_posts_site_id ON blog_posts(site_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_category_id ON sites(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_indexing_mode ON sites(indexing_mode)`);
    results.push('Created indexes');

    // Verification
    const verticals = await pool.query('SELECT name, slug FROM verticals');
    const categories = await pool.query('SELECT name, slug FROM categories');
    const services = await pool.query('SELECT s.name, c.name as category FROM services s JOIN categories c ON s.category_id = c.id ORDER BY c.name, s.name');

    return NextResponse.json({
      success: true,
      steps: results,
      verification: {
        verticals: verticals.rows,
        categories: categories.rows,
        services: services.rows,
      }
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ 
      error: error.message,
      detail: error.detail || null,
      hint: error.hint || null 
    }, { status: 500 });
  }
}
