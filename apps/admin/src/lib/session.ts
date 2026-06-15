/**
 * session — server-side session helpers (MT-6 + MT-7)
 *
 * Replaces the legacy HMAC cookie pattern with DB-backed sessions that are
 * server-side revocable. Used by:
 *   - /api/platform-auth/login (creates platform sessions)
 *   - /api/tenant-auth/login (creates tenant sessions)
 *   - /api/platform-auth/logout + /api/tenant-auth/logout (deletes sessions)
 *   - any future helper that wants to know "who is this request?"
 *
 * Cookie name: `cl_session`
 * Cookie scope: `.continueleads.com` so login persists across subdomains
 * Cookie flags: HttpOnly, Secure (prod), SameSite=Strict
 * Expiration: 12 hours (uniform for platform and tenant users per the spec)
 *
 * Token format: 32 random bytes → 64-char hex string. The COOKIE carries
 * the raw token; the DATABASE only stores its SHA-256 hash. That way a
 * dump of the sessions table doesn't reveal valid cookies.
 *
 * Spec: docs/multi-tenancy-spec.md
 */

import crypto from 'crypto';
import { withPlatformContext } from './db-context';

export const SESSION_COOKIE_NAME = 'cl_session';
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;       // 12 hours
const COOKIE_DOMAIN = '.continueleads.com';

/** Random opaque token. 32 bytes → 64 hex chars. */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 of the raw token, hex-encoded. Stored in `sessions.token_hash`. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type SessionInput =
  | { userType: 'platform'; platformUserId: string }
  | { userType: 'tenant'; tenantUserId: string; tenantId: string };

export type LoadedSession =
  | {
      sessionId: string;
      userType: 'platform';
      platformUserId: string;
      expiresAt: Date;
    }
  | {
      sessionId: string;
      userType: 'tenant';
      tenantUserId: string;
      tenantId: string;
      expiresAt: Date;
    };

/**
 * Create a new session row and return the RAW token (caller puts it in
 * a cookie). The raw token is never persisted — only its SHA-256 hash.
 */
export async function createSession(
  input: SessionInput,
  meta: { ipAddress?: string; userAgent?: string } = {}
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await withPlatformContext(async (client) => {
    if (input.userType === 'platform') {
      await client.query(
        `INSERT INTO sessions
            (token_hash, user_type, platform_user_id, expires_at, ip_address, user_agent)
         VALUES ($1, 'platform', $2, $3, $4, $5)`,
        [tokenHash, input.platformUserId, expiresAt, meta.ipAddress ?? null, meta.userAgent ?? null]
      );
    } else {
      await client.query(
        `INSERT INTO sessions
            (token_hash, user_type, tenant_user_id, tenant_id, expires_at, ip_address, user_agent)
         VALUES ($1, 'tenant', $2, $3, $4, $5, $6)`,
        [tokenHash, input.tenantUserId, input.tenantId, expiresAt, meta.ipAddress ?? null, meta.userAgent ?? null]
      );
    }
  });

  return { rawToken, expiresAt };
}

/**
 * Look up a session by its RAW token (from the cookie). Returns null if
 * the session doesn't exist, has been deleted, or has expired.
 *
 * Also touches `last_seen_at` on a successful lookup so we can surface
 * "this session was last used X ago" in the future.
 */
export async function loadSessionByToken(rawToken: string): Promise<LoadedSession | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashToken(rawToken);

  return withPlatformContext(async (client) => {
    const result = await client.query(
      `SELECT id, user_type, platform_user_id, tenant_user_id, tenant_id, expires_at
         FROM sessions
        WHERE token_hash = $1
          AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash]
    );

    const row = result.rows[0] as
      | {
          id: string;
          user_type: 'platform' | 'tenant';
          platform_user_id: string | null;
          tenant_user_id: string | null;
          tenant_id: string | null;
          expires_at: Date;
        }
      | undefined;
    if (!row) return null;

    // Best-effort touch — non-blocking; ignore failure.
    client.query(
      `UPDATE sessions SET last_seen_at = NOW() WHERE id = $1`,
      [row.id]
    ).catch(() => {});

    if (row.user_type === 'platform') {
      return {
        sessionId: row.id,
        userType: 'platform',
        platformUserId: row.platform_user_id!,
        expiresAt: row.expires_at,
      };
    }
    return {
      sessionId: row.id,
      userType: 'tenant',
      tenantUserId: row.tenant_user_id!,
      tenantId: row.tenant_id!,
      expiresAt: row.expires_at,
    };
  });
}

/**
 * Delete a session by its RAW token (logout). Idempotent — deleting an
 * already-gone session is a no-op.
 */
export async function deleteSessionByToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await withPlatformContext(async (client) => {
    await client.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  });
}

/**
 * Cookie serializer for Set-Cookie responses. Returns the value to
 * pass to NextResponse.cookies.set() or directly to Set-Cookie header.
 */
export function sessionCookieOptions(expiresAt: Date) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    expires: expiresAt,
    path: '/',
    // Scope to .continueleads.com so the cookie works across admin.* and
    // {tenant}.* subdomains. In dev (localhost) we leave domain undefined.
    ...(isProd ? { domain: COOKIE_DOMAIN } : {}),
  };
}

/** Used by logout to clear the cookie. */
export function clearedCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    expires: new Date(0),
    path: '/',
    ...(isProd ? { domain: COOKIE_DOMAIN } : {}),
  };
}
