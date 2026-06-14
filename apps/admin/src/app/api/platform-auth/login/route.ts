/**
 * POST /api/platform-auth/login — MT-6
 *
 * Platform-user login. Only reachable from admin.continueleads.com.
 * Body: { email, password }
 *
 * On success:
 *   - Creates a row in `sessions` with user_type='platform'
 *   - Sets the `cl_session` cookie scoped to .continueleads.com
 *   - Returns { ok: true, user: { id, email, displayName } }
 *
 * On failure:
 *   - 400 if email or password missing / malformed
 *   - 401 with { error: 'Invalid credentials' } on auth failure
 *     (deliberately vague — does not distinguish "no such user" from
 *     "wrong password", standard anti-enumeration posture)
 *   - 403 if the request didn't come from admin.continueleads.com
 *   - 500 on unexpected error
 *
 * Spec: docs/multi-tenancy-spec.md
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withPlatformContext } from '@/lib/db-context';
import { createSession, sessionCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Defence in depth: middleware should already prevent non-admin
  // subdomains from reaching this route, but check the header in case.
  const subdomainType = request.headers.get('x-cl-subdomain-type');
  if (subdomainType !== 'admin') {
    return NextResponse.json(
      { error: 'Platform login is only available from admin.continueleads.com' },
      { status: 403 }
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 }
    );
  }
  if (email.length > 255 || password.length > 1024) {
    return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  }

  try {
    const user = await withPlatformContext(async (client) => {
      const result = await client.query(
        `SELECT id, email, display_name, password_hash
           FROM platform_users
          WHERE email = $1 AND is_active = true
          LIMIT 1`,
        [email]
      );
      const row = result.rows[0] as
        | {
            id: string;
            email: string;
            display_name: string | null;
            password_hash: string;
          }
        | undefined;
      return row ?? null;
    });

    // Constant-ish-time check: always run bcrypt even on missing user
    // to avoid leaking "user does not exist" via timing.
    const passwordHashToTry = user?.password_hash ?? '$2a$12$invalidplaceholder.invalidplaceholder.invalidplaceholder.x';
    const ok = await bcrypt.compare(password, passwordHashToTry);

    if (!user || !ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Update last_login_at — best-effort.
    withPlatformContext(async (client) => {
      await client.query(
        `UPDATE platform_users SET last_login_at = NOW() WHERE id = $1`,
        [user.id]
      );
    }).catch(() => {});

    const { rawToken, expiresAt } = await createSession(
      { userType: 'platform', platformUserId: user.id },
      {
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
      }
    );

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
    response.cookies.set({
      ...sessionCookieOptions(expiresAt),
      value: rawToken,
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
