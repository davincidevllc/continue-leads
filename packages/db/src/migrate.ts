import * as fs from 'fs';
import * as path from 'path';
import { getPool, closePool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

interface MigrationRecord {
  version: string;
  applied_at: Date;
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query<MigrationRecord>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return new Set(result.rows.map((r) => r.version));
}

async function getMigrationFiles(): Promise<string[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files;
}

async function applyMigration(filename: string): Promise<void> {
  const pool = getPool();
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf-8');
  const version = filename.replace('.sql', '');

  console.log(`[MIGRATE] Applying: ${filename}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    // The migration SQL itself may insert into schema_migrations,
    // so we use ON CONFLICT to avoid duplicates
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [version]
    );
    await client.query('COMMIT');
    console.log(`[MIGRATE] Applied: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[MIGRATE] FAILED: ${filename}`);
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  console.log('[MIGRATE] Starting migration...');
  console.log(`[MIGRATE] Environment: ${process.env.NODE_ENV || 'development'}`);

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = await getMigrationFiles();

  const pending = files.filter((f) => !applied.has(f.replace('.sql', '')));

  if (pending.length === 0) {
    console.log('[MIGRATE] No pending migrations.');
    return;
  }

  console.log(`[MIGRATE] ${pending.length} pending migration(s).`);

  for (const file of pending) {
    await applyMigration(file);
  }

  console.log('[MIGRATE] All migrations applied successfully.');
}

// CLI entry point
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('[MIGRATE] Done.');
      return closePool();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[MIGRATE] Fatal error:', err);
      process.exit(1);
    });
}
