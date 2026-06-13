import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge-runtime middleware. Two responsibilities:
 *
 * 1. Subdomain routing (MT-5). Parse the host header to determine which
 *    type of request this is (platform admin vs a specific tenant), and
 *    attach two response headers downstream code can read:
 *      x-cl-subdomain-type:  'admin' | 'tenant' | 'apex' | 'unknown'
 *      x-cl-subdomain-slug:  the literal subdomain string (e.g. 'leadsquad')
 *
 * 2. Backwards-compatible auth for legacy `cl_admin_session` HMAC cookie.
 *    Existing API routes still rely on this cookie. The HMAC check stays
 *    here until MT-8 refactors the routes to use the new DB-backed
 *    sessions. New routes (platform-auth/*, tenant-auth/*) handle their
 *    own auth via the sessions table.
 *
 * Edge runtime constraints (do NOT change):
 *   - No `pg`, no `bcrypt`, no Node built-ins. Only Web APIs.
 *   - That's why HMAC verification uses `crypto.subtle` (Web Crypto), not
 *     the Node `crypto` module.
 *
 * Reserved subdomains (cannot be tenant slugs):
 *   admin, www, app, api, preview, mail, staging, prod, assets, cdn,
 *   docs, help, support
 *
 * Spec: docs/multi-tenancy-spec.md
 */

const AUTH_COOKIE = 'cl_admin_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'preview', 'mail', 'staging', 'prod',
  'assets', 'cdn', 'docs', 'help', 'support',
]);

type SubdomainType = 'admin' | 'tenant' | 'apex' | 'unknown';

function parseSubdomain(host: string | null): {
  type: SubdomainType;
  slug: string | null;
} {
  if (!host) return { type: 'unknown', slug: null };
  // Strip the port for comparison
  const hostname = host.split(':')[0].toLowerCase();
  // Bare domain → apex
  if (hostname === 'continueleads.com') {
    return { type: 'apex', slug: null };
  }
  // localhost / dev → treat as admin for convenience during local dev
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { type: 'admin', slug: 'admin' };
  }
  // {sub}.continueleads.com pattern
  const match = hostname.match(/^([a-z0-9-]+)\.continueleads\.com$/);
  if (!match) return { type: 'unknown', slug: null };
  const sub = match[1];
  if (sub === 'admin') return { type: 'admin', slug: 'admin' };
  if (RESERVED_SUBDOMAINS.has(sub)) return { type: 'unknown', slug: sub };
  return { type: 'tenant', slug: sub };
}

async function verifyLegacyHmacToken(token: string, secret: string): Promise<boolean> {
  const [tsStr, sig] = token.split('.');
  if (!tsStr || !sig) return false;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  if (Date.now() - ts > SESSION_DURATION_MS) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(tsStr));
  const expected = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (sig.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Paths that bypass auth on EVERY subdomain. Login UIs and the public
 * lead-capture endpoint must always be reachable.
 */
function isAlwaysPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||                 // legacy HMAC login
    pathname.startsWith('/api/platform-auth/') ||        // MT-6 platform login
    pathname.startsWith('/api/tenant-auth/') ||          // MT-7 tenant login
    pathname.startsWith('/api/leads/capture') ||         // public lead-form endpoint
    pathname === '/api/health'                           // MON-2 health endpoint (ALB + uptime probes)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');
  const { type: subdomainType, slug: subdomainSlug } = parseSubdomain(host);

  // Attach subdomain metadata to the request so downstream API routes /
  // server components can read it. Done by rewriting request headers,
  // which Next.js forwards to the downstream handler.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-cl-subdomain-type', subdomainType);
  if (subdomainSlug) requestHeaders.set('x-cl-subdomain-slug', subdomainSlug);

  // Apex domain → redirect to admin subdomain so there's always an
  // intentional landing place. (Marketing site would replace this in v2.)
  if (subdomainType === 'apex') {
    return NextResponse.redirect(new URL('https://admin.continueleads.com/login'));
  }

  // Unknown subdomain (typo, removed tenant, reserved word, etc.) → 404-ish.
  // We give a redirect to the admin login rather than a bare 404 so the
  // user gets somewhere useful.
  if (subdomainType === 'unknown') {
    return NextResponse.redirect(new URL('https://admin.continueleads.com/login'));
  }

  // Always-public paths: pass through with the subdomain headers attached.
  if (isAlwaysPublic(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // For tenant subdomains: protected routes are checked by the route
  // handlers themselves (against the sessions table). Middleware just
  // forwards the subdomain context so they can resolve the tenant.
  //
  // We deliberately do NOT bounce unauthenticated tenant requests to
  // /login here — that's the responsibility of the page/route handler,
  // which can render an appropriate "Sign in to {Tenant}" page.
  if (subdomainType === 'tenant') {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Admin subdomain: legacy HMAC cookie check stays in place for
  // backwards compatibility with the existing routes. MT-8 will remove
  // this once routes migrate to the new sessions-table model.
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!token || !secret || !(await verifyLegacyHmacToken(token, secret))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
