#!/usr/bin/env node

/**
 * Migration Runner — Continue Leads
 * 
 * Connects to your PostgreSQL database (local or RDS) and runs migration SQL files.
 * 
 * Usage:
 *   node run-migration.js                    # Runs against local DB
 *   node run-migration.js --production       # Runs against RDS (uses env vars)
 * 
 * Environment variables (for --production):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 * 
 * Or set DATABASE_URL for local development.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ---------- Configuration ----------

const isProduction = process.argv.includes('--production');
const isDryRun = process.argv.includes('--dry-run');

let poolConfig;

if (isProduction) {
  // RDS connection (same env vars as your ECS task definition)
  poolConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  };
  console.log(`🔗 Connecting to RDS: ${poolConfig.host}/${poolConfig.database}`);
} else {
  // Local development
  const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/continueleads';
  poolConfig = { connectionString: dbUrl };
  console.log(`🔗 Connecting to local DB: ${dbUrl}`);
}

// ---------- Migration Runner ----------

async function runMigration() {
  const pool = new Pool(poolConfig);
  
  try {
    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT current_database(), current_user, version()');
    console.log(`✅ Connected to: ${result.rows[0].current_database} as ${result.rows[0].current_user}`);
    console.log(`   PostgreSQL: ${result.rows[0].version.split(',')[0]}`);
    client.release();

    // Find migration files (sorted by name)
    const migrationsDir = path.join(__dirname);
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (sqlFiles.length === 0) {
      console.log('⚠️  No .sql files found in migrations directory');
      return;
    }

    console.log(`\n📋 Found ${sqlFiles.length} migration(s):`);
    sqlFiles.forEach(f => console.log(`   - ${f}`));

    // Run each migration
    for (const file of sqlFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`\n🚀 Running: ${file}`);
      console.log(`   Size: ${(sql.length / 1024).toFixed(1)} KB`);

      if (isDryRun) {
        console.log('   ⏭️  DRY RUN — skipping execution');
        continue;
      }

      const start = Date.now();
      try {
        await pool.query(sql);
        const elapsed = Date.now() - start;
        console.log(`   ✅ Complete (${elapsed}ms)`);
      } catch (err) {
        console.error(`   ❌ FAILED: ${err.message}`);
        console.error(`   Detail: ${err.detail || 'none'}`);
        console.error(`   Hint: ${err.hint || 'none'}`);
        throw err; // Stop on first failure
      }
    }

    // ---------- Verification ----------
    console.log('\n📊 Verification:');

    // Check verticals (industry)
    const verticals = await pool.query('SELECT slug, name, status FROM verticals');
    console.log(`   Verticals (industries): ${verticals.rowCount}`);
    verticals.rows.forEach(r => console.log(`     - ${r.name} (${r.slug}) [${r.status}]`));

    // Check categories
    const categories = await pool.query(`
      SELECT c.slug, c.name, c.status, v.name as vertical 
      FROM categories c 
      LEFT JOIN verticals v ON c.vertical_id = v.id
      ORDER BY c.name
    `);
    console.log(`   Categories: ${categories.rowCount}`);
    categories.rows.forEach(r => console.log(`     - ${r.name} (${r.slug}) → ${r.vertical || 'NO VERTICAL'} [${r.status}]`));

    // Check services
    const services = await pool.query(`
      SELECT s.slug, s.name, c.name as category 
      FROM services s 
      JOIN categories c ON s.category_id = c.id
      ORDER BY c.name, s.name
    `);
    console.log(`   Services: ${services.rowCount}`);
    services.rows.forEach(r => console.log(`     - ${r.name} (${r.slug}) → ${r.category}`));

    // Check sites table columns
    const sitesCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sites' 
      AND column_name IN ('category_id', 'brand_name', 'brand_seed', 'target_geo_config', 'blog_config', 'indexing_mode')
      ORDER BY column_name
    `);
    console.log(`   New sites columns: ${sitesCols.rowCount}`);
    sitesCols.rows.forEach(r => console.log(`     - ${r.column_name} (${r.data_type})`));

    // Check new tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('verticals', 'categories', 'services', 'service_types', 'question_sets', 'question_set_versions', 'blog_posts')
      ORDER BY table_name
    `);
    console.log(`   Tables created: ${tables.rows.map(r => r.table_name).join(', ')}`);

    console.log('\n🎉 Migration complete!');

  } catch (err) {
    console.error('\n💥 Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
