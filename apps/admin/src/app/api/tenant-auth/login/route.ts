/**
 * POST /api/tenant-auth/login — MT-7
 *
 * Tenant-user login. Only reachable from {tenant-slug}.continueleads.com.
 * The middleware sets x-cl-subdomain-slug to the slug; we resolve it to
 * the tenant UUID and look up the user.
 *
 * Body: { email, password }
 *
 * On success:
 *   - Creates a row in `sessions` with user_type='tenant' + tenant_id
 *   - Sets the `cl_session` cookie scoped to .continueleads.com
 *   - Returns { ok: true, user: { id, email, displayName, role }, tenant: { id, slug, displayName } }
 *
 * On failure:
 *   - 400 if email/password missing or malformed
 *   - 401 with { error: 'Invalid credentials' } on auth failure
 *     (deliberately vague — does not distinguish "no such user/tenant"
 *     from "wrong password", standard anti-enumeration posture)
 *   - 403 if the request didn't come from a tenant subdomain
 *   - 404 if the tenant slug doesn't resolve to an active tenant
 *   - 500 on unexpected error
 *
 * Spec: docs/multi-tenancy-spec.md
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { resolveTenantBySlug, withPlatformContext } from '@/lib/db-context';
import { createSession, sessionCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const subdomainType = request.headers.get('x-cl-subdomain-type');
  const slug = request.headers.get('x-cl-subdomain-slug');
  if (subdomainType !== 'tenant' || !slug) {
    return NextResponse.json(
      { error: 'Tenant login is only available from a tenant subdomain' },
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
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const user = await withPlatformContext(async (client) => {
      const result = await client.query(
        `SELECT id, email, display_name, role, password_hash
           FROM tenant_users
          WHERE tenant_id = $1 AND email = $2 AND is_active = true
          LIMIT 1`,
        [tenant.id, email]
      );
      const row = result.rows[0] as
        | {
            id: string;
            email: string;
            display_name: string | null;
            role: 'admin' | 'ops' | 'sales' | 'dev';
            password_hash: string;
          }
        | undefined;
      return row ?? null;
    });

    // Constant-ish-time check (see platform login for rationale).
    const passwordHashToTry = user?.password_hash ?? '$2a$12$invalidplaceholder.invalidplaceholder.invalidplaceholder.x';
    const ok = await bcrypt.compare(password, passwordHashToTry);

    if (!user || !ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    withPlatformContext(async (client) => {
      await client.query(
        `UPDATE tenant_users SET last_login_at = NOW() WHERE id = $1`,
        [user.id]
      );
    }).catch(() => {});

    const { rawToken, expiresAt } = await createSession(
      { userType: 'tenant', tenantUserId: user.id, tenantId: tenant.id },
      {
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
      }
    );

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
      tenant: { id: tenant.id, slug, displayName: tenant.display_name },
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
