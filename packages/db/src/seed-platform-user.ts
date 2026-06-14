#!/usr/bin/env node
/**
 * seed-platform-user — create the first platform user (MT-6 helper)
 *
 * Usage:
 *   pnpm --filter @continue-leads/db seed:platform-user <email> <password> [displayName]
 *
 * Example:
 *   pnpm --filter @continue-leads/db seed:platform-user \
 *     thiago@continueleads.com 'YourStrongPasswordHere' 'Thiago DeSouza'
 *
 * Reads the password from argv (NOT a prompt) so it works in CI/CloudShell
 * one-shot contexts. Quote the password to protect against shell expansion.
 *
 * Idempotent: on email collision, the existing row is UPDATED with the new
 * password_hash + display_name. Safe to re-run to rotate Thiago's password.
 *
 * Requires the same DB env vars as the migration runner (DB_HOST, DB_PORT,
 * DB_NAME, DB_USER, DB_PASSWORD) — or DATABASE_URL.
 */

import bcrypt from 'bcryptjs';
import { getPool, closePool } from './pool';

const BCRYPT_COST = 12;

async function main() {
  const [, , emailArg, passwordArg, displayNameArg] = process.argv;

  if (!emailArg || !passwordArg) {
    console.error('Usage: seed-platform-user <email> <password> [displayName]');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  if (!email.includes('@') || email.length > 255) {
    console.error('Email is invalid or too long.');
    process.exit(1);
  }
  if (passwordArg.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  console.log(`Hashing password (bcrypt cost=${BCRYPT_COST})…`);
  const passwordHash = await bcrypt.hash(passwordArg, BCRYPT_COST);

  const displayName = displayNameArg?.trim() || email.split('@')[0];

  const pool = getPool();
  try {
    const result = await pool.query<{
      id: string;
      email: string;
      action: 'inserted' | 'updated';
    }>(
      `INSERT INTO platform_users (email, password_hash, display_name, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name  = COALESCE(EXCLUDED.display_name, platform_users.display_name)
       RETURNING id, email, CASE WHEN xmax = 0 THEN 'inserted' ELSE 'updated' END AS action`,
      [email, passwordHash, displayName]
    );

    const row = result.rows[0];
    if (!row) {
      // INSERT ... ON CONFLICT ... RETURNING always produces a row; this
      // branch exists to satisfy TS noUncheckedIndexedAccess.
      console.error('❌ Upsert returned no row — unexpected.');
      process.exit(1);
    }
    console.log(`✅ ${row.action.toUpperCase()}: platform_user ${row.email} (id=${row.id})`);
    console.log('');
    console.log('You can now log in at https://admin.continueleads.com/login');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`❌ Failed: ${msg}`);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
