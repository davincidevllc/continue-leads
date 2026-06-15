/**
 * db-context — tenant-aware DB transaction wrapper
 *
 * Phase 0 Burst 0b.2 / MT-4. Spec: docs/multi-tenancy-spec.md
 *
 * Multi-tenancy in this platform is enforced by PostgreSQL Row-Level Security
 * (RLS). RLS policies on every tenant-scoped table filter rows by
 * `current_setting('app.current_tenant_id')::uuid`. The DATABASE enforces the
 * filter, not application code — a missing WHERE clause in a query physically
 * cannot leak data across tenants.
 *
 * This file provides the two wrappers every tenant-aware API route MUST use:
 *
 *   withTenantContext({ tenantId }, async (client) => { ... })
 *     Opens a transaction as `app_tenant_user` (RLS-subject role) with
 *     `app.current_tenant_id` set to the given tenant. All queries inside
 *     the callback are automatically tenant-scoped by RLS.
 *
 *   withPlatformContext(async (client) => { ... })
 *     Opens a transaction as `app_platform_user` (BYPASSRLS role). Used for
 *     cross-tenant operations: platform admin lookups, the middleware tenant
 *     resolver, impersonation flows, the migration runner.
 *
 * Both functions:
 *   - Begin a transaction
 *   - SET LOCAL ROLE to the appropriate DB role
 *   - (tenant only) `set_config('app.current_tenant_id', $1, true)` so the
 *     RLS policies have something to filter against
 *   - Run the callback
 *   - COMMIT on success, ROLLBACK on any thrown error
 *   - Always release the connection back to the pool
 *
 * NEVER use the raw `pool` directly for tenant data — only via these wrappers.
 * The linter rule for this lives in TODO: future MT-8 work.
 *
 * Edge cases handled:
 *   - tenantId is not a valid UUID → throws early, no DB call made
 *   - DB roles don't exist yet (migrations 0003+0004 not applied) → SET LOCAL
 *     ROLE will fail loudly; caller sees a clear "role does not exist" error
 *   - Connection pool exhausted → propagates the underlying pg timeout error
 *   - Callback throws → ROLLBACK is guaranteed before the error propagates
 */

import pool from './pool';

// `pool` is typed `any` in src/lib/pool.ts to work around `@types/pg` ESM
// resolution under moduleResolution: bundler. We mirror that here and use a
// local `PoolClient` alias for callback typing — at runtime it's a real
// pg PoolClient with `.query()` and `.release()`.
type PoolClient = any;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TenantContext = {
  tenantId: string;
};

/**
 * Run a callback within a transaction scoped to a specific tenant.
 *
 * RLS policies on every tenant-scoped table will automatically filter queries
 * by `tenant_id = app.current_tenant_id`. INSERTs without an explicit
 * `tenant_id` value will fail the policy's `WITH CHECK` clause.
 *
 * @param context - { tenantId } — must be a valid UUID. Typically resolved
 *                  from the request's session cookie + subdomain.
 * @param fn - async callback receiving a connected PoolClient. Use it for all
 *             queries that need tenant scoping.
 * @returns the value returned by `fn`.
 * @throws if `tenantId` is not a UUID, if the DB roles aren't installed yet,
 *         if the callback throws (ROLLBACK runs first), or if the pool is
 *         exhausted.
 */
export async function withTenantContext<T>(
  context: TenantContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!context.tenantId || !UUID_REGEX.test(context.tenantId)) {
    throw new Error(
      `withTenantContext: tenantId must be a UUID, got: ${JSON.stringify(context.tenantId)}`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_tenant_user');
    // set_config(name, value, is_local) — the `true` makes it transaction-local
    // and accepts parameters (unlike `SET LOCAL` which doesn't).
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      [context.tenantId]
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // If ROLLBACK itself fails (already-aborted transaction etc.), surface
      // the original error, not the rollback failure.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run a callback within a transaction as the platform-level DB role.
 *
 * The `app_platform_user` role has `BYPASSRLS`, so queries can see and modify
 * rows across all tenants. Use this for:
 *   - The middleware lookup that resolves a subdomain slug → tenant UUID
 *   - Platform admin pages (the cross-tenant overview at admin.continueleads.com)
 *   - Impersonation flows (where a platform user acts as a tenant user)
 *   - The migration runner (which must alter schema regardless of tenant)
 *
 * The boundary for who can call this wrapper is enforced at the route layer
 * via `requirePlatform()` (added in MT-6). This wrapper itself only manages
 * the DB transaction.
 *
 * @param fn - async callback receiving a connected PoolClient.
 * @returns the value returned by `fn`.
 * @throws if the DB roles aren't installed yet, if the callback throws
 *         (ROLLBACK runs first), or if the pool is exhausted.
 */
export async function withPlatformContext<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_platform_user');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Same rationale as withTenantContext above.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve a tenant slug → UUID. Convenience for the subdomain middleware
 * (MT-5) which gets a slug from the host header and needs the UUID to put
 * into TenantContext.
 *
 * Returns null if no active tenant with that slug exists. Caller decides
 * whether that's a 404 or a "not found" page or a redirect.
 *
 * Always runs in platform context because the lookup must work BEFORE we
 * know which tenant the request is for.
 */
export async function resolveTenantBySlug(
  slug: string
): Promise<{ id: string; display_name: string; status: string } | null> {
  return withPlatformContext(async (client) => {
    const result = await client.query(
      `SELECT id, display_name, status
         FROM tenants
        WHERE slug = $1
          AND status = 'ACTIVE'
        LIMIT 1`,
      [slug]
    );
    const row = result.rows[0] as
      | { id: string; display_name: string; status: string }
      | undefined;
    return row ?? null;
  });
}
