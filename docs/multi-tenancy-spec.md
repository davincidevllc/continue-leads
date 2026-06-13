# Multi-Tenancy Spec

**Status:** Draft, written 2026-05-XX (insert when committed)
**Author:** Thiago + Claude
**Supersedes:** the implicit single-tenant assumptions throughout the original Master Plan
**Affects:** every existing table, every existing API route, the auth model, the URL structure, and the Phase 0 plan

## Why this exists

Continue Leads is a platform, not a single business. Multiple companies will use it:

- **LeadSquad** (Tampa partners) — lead-gen operation on its own
- **Localize** (Joe + Isis, Boston-based) — separate lead-gen operation
- Future tenants we add later

Each tenant operates independently. A Sales user at LeadSquad must never see Localize's leads. A buyer onboarded by Localize must never receive a lead from LeadSquad's brands. Tenant boundaries are a primary security guarantee, not a UI convenience.

This spec defines how that isolation works.

## Terminology (used consistently in code and docs)

| Term | Meaning |
|---|---|
| **Tenant** | One operating company using Continue Leads (LeadSquad, Localize, etc.). Top-level isolation boundary. |
| **Brand** | One lead-gen "front" owned by a tenant. Has its own domain, page set, look-and-feel. One tenant has many brands. |
| **Page** | One HTML page rendered for a brand (money, city, service, legal, blog). One brand has many pages. |
| **Tenant user** | A human user attached to a single tenant (Joe, Isis, LeadSquad partner). |
| **Platform user** | Thiago (and any future Continue Leads operator). Exists outside all tenants. Can see across tenants. |
| **Buyer** | A lead purchaser (HVAC contractor, painting franchise, lead aggregator). Belongs to one or more tenants — buyers are tenant-scoped to start. |
| **Lead** | A consumer who filled out a form or called a tracked number. Belongs to the brand that captured them → belongs to that brand's tenant. |

Avoid `account` and `company` in code — both terms get used elsewhere (Stripe accounts, the company string on a buyer record, etc.). Sticking with `tenant` everywhere prevents collision.

## Data model

### New tables

```sql
-- Top-level tenant entity
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(63) UNIQUE NOT NULL,                      -- "leadsquad" → used in subdomain
  display_name VARCHAR(255) NOT NULL,                    -- "LeadSquad"
  legal_name VARCHAR(255),                               -- "LeadSquad Holdings LLC"
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  primary_contact_email VARCHAR(255),
  primary_contact_phone VARCHAR(20),
  logo_url TEXT,                                         -- S3 URL or CDN URL
  primary_color VARCHAR(7),                              -- hex, e.g. "#2E75B6"
  settings JSONB NOT NULL DEFAULT '{}',                  -- feature flags, limits
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_platform_user_id UUID                       -- nullable; null for the seeded "Internal" tenant
);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

-- Platform-level users (Thiago, future Continue Leads ops)
CREATE TABLE platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                           -- bcrypt, cost factor 12
  display_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant-level users (Joe, Isis, LeadSquad partners, contractors with logins)
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(255),
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'ops', 'sales', 'dev')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  invited_by_user_id UUID,                               -- references tenant_users(id), nullable for first admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)                               -- same email can exist across tenants
);
CREATE INDEX idx_tenant_users_tenant_email ON tenant_users(tenant_id, email);

-- Session storage (replaces HMAC cookie)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,                       -- SHA-256 of raw token; raw token in cookie
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('platform', 'tenant')),
  platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE,
  tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- redundant for tenant sessions, simplifies lookup
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  CHECK (
    (user_type = 'platform' AND platform_user_id IS NOT NULL AND tenant_user_id IS NULL AND tenant_id IS NULL) OR
    (user_type = 'tenant' AND tenant_user_id IS NOT NULL AND tenant_id IS NOT NULL AND platform_user_id IS NULL)
  )
);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE expires_at > NOW();

-- Tenant-scoped audit log
CREATE TABLE tenant_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
  platform_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL,   -- when platform user acts on behalf of tenant
  action VARCHAR(64) NOT NULL,                           -- "brand.created", "user.role_changed", etc.
  resource_type VARCHAR(64),                             -- "brand", "page", "lead", etc.
  resource_id VARCHAR(128),
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tenant_audit_tenant_created ON tenant_audit_log(tenant_id, created_at DESC);

-- Platform-level audit log (cross-tenant actions)
CREATE TABLE platform_audit_log (
  id BIGSERIAL PRIMARY KEY,
  platform_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,                           -- "tenant.created", "tenant.suspended", "impersonation.started", etc.
  target_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_platform_audit_created ON platform_audit_log(created_at DESC);
```

### Existing tables — add `tenant_id`

Every table that holds tenant-scoped data needs a non-null `tenant_id` column. Migration sequence:

1. Add column as nullable
2. Backfill all rows to the seeded "Internal" tenant
3. Set NOT NULL

Tables that get `tenant_id`:

```
sites, site_pages, site_target_states, site_target_counties, site_target_zips,
site_target_cities, generation_jobs, generation_job_items, qa_runs, qa_findings
```

Tables that stay shared (no tenant_id):

```
states, counties, cities, zip_codes,                   -- geographic data: shared reference
verticals, categories, services, question_sets,        -- taxonomy: shared reference
templates                                              -- page templates: shared reference
```

Future tables (will need tenant_id from day one):

```
leads, buyers, lead_bids, lead_distributions, api_usage, blog_posts
```

## Isolation model — Postgres Row-Level Security (RLS)

We use Postgres RLS for tenant isolation. This is the cleanest defense — the DATABASE enforces tenant filtering, not the application. An application bug that forgets a filter can't leak data across tenants.

### How it works

1. Every tenant-scoped table has RLS enabled.
2. A policy auto-injects `WHERE tenant_id = current_setting('app.current_tenant_id')::uuid` on every query.
3. At the start of every HTTP request, the app sets the session variable to the requesting user's tenant.
4. The app cannot bypass the policy unless the DB role has `BYPASSRLS` (only platform-level role does).

### Schema

```sql
-- Example for sites table
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY sites_tenant_isolation ON sites
  FOR ALL
  TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Repeat for every tenant-scoped table.
```

### Two DB roles

- `app_tenant_user` — used by the running app for tenant-scoped requests. Subject to RLS.
- `app_platform_user` — used for platform-admin requests + background jobs. Has `BYPASSRLS`. Used sparingly.

### Per-request setup

Every API route opens a transaction with:

```sql
SET LOCAL app.current_tenant_id = '<resolved tenant id>';
SET LOCAL ROLE app_tenant_user;
```

If the user is a platform user, the route sets the platform role instead:

```sql
SET LOCAL ROLE app_platform_user;
-- No tenant_id setting; queries can hit any tenant's data
```

### Helper utility

`apps/admin/src/lib/db-context.ts` exposes a single function:

```typescript
export async function withTenantContext<T>(
  context: { tenantId: string; userType: 'tenant' | 'platform' },
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (context.userType === 'platform') {
      await client.query("SET LOCAL ROLE app_platform_user");
    } else {
      await client.query("SET LOCAL ROLE app_tenant_user");
      await client.query("SET LOCAL app.current_tenant_id = $1", [context.tenantId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

All API routes use this wrapper. If you forget to use it, the route still works but queries default to the LEAST-privileged role (which has no access) — fail-closed, not fail-open.

### Beyond the database — non-leak guarantees

RLS protects data. These rules protect the surface area:

- **No tenant-listing endpoint accessible to tenant users.** The `/api/tenants` route is platform-only. Tenant users have no way to enumerate other tenants — they can't even know whether another tenant exists.
- **Subdomain validation never echoes other slugs.** If a user hits `unknownco.continueleads.com`, the response is a generic "not found" — never "did you mean leadsquad.continueleads.com?".
- **Tenant onboarding emails contain no references to other tenants.** Templated copy uses the recipient tenant's name only.
- **Error messages don't reveal tenant existence.** Login failures at `leadsquad.continueleads.com` say "Invalid credentials" — never "no such tenant" (which would let an attacker probe which slugs exist).
- **Email forwarding is brand-scoped, not cross-tenant.** A brand domain `bostonpaintingpros.com` forwards mail to its OWNING TENANT's contact email, never to a tenant table lookup.
- **Audit logs are tenant-scoped.** `tenant_audit_log` queries are filtered by RLS; no tenant user can read another tenant's audit history.
- **CI cross-tenant tests are mandatory.** Every push to main runs an isolated test: create tenant A, create tenant B, create data in each as their respective users, then attempt every cross-tenant read/write combination. Any unexpected success fails the build.

## URL strategy

### Subdomains per tenant

- `app.continueleads.com` — root login / marketing landing
- `admin.continueleads.com` — platform admin (Thiago) — single-tenant view of all tenants
- `{tenant-slug}.continueleads.com` — tenant-scoped admin (LeadSquad, Localize)
- `preview.continueleads.com/{tenant-slug}/{brand-id}/` — Phase 2 staging brand sites
- `{brand-domain}.com` — live brand sites (Phase 2)

### Wildcard ACM cert

We need `*.continueleads.com` as a wildcard cert on the ALB. This covers all current subdomains plus any new tenant we add. The existing `admin.continueleads.com` cert from Phase 1 gets replaced by the wildcard.

DNS validation for the wildcard uses one CNAME at `_acme.continueleads.com` → Cloudflare (proxy off, as established 2026-05-04).

### Routing in Next.js

`apps/admin/src/middleware.ts` reads the host header and:

1. Strips `.continueleads.com` to get the subdomain part
2. Looks up the tenant by slug
3. Attaches `tenant` to the request context via header rewrite OR by setting it in the response (depending on whether app vs platform)
4. Redirects to `/login` if no valid session, OR proceeds

Subdomain → tenant mapping is cached in-memory with a short TTL (60s) and invalidated on tenant create/update. This keeps the host-header → tenant lookup fast without DB hit per request.

### Custom domains (deferred)

Tenants like LeadSquad eventually want `app.leadsquad.com` instead of `leadsquad.continueleads.com`. That's a Phase 0+1 deferred feature requiring:

- ACM cert per custom domain (manual setup)
- ALB listener rule per custom domain
- Tenant config field `custom_domain`

We don't build this in v1. Subdomain is enough for the first 6+ months.

## Authentication model

### Two login surfaces

1. **`admin.continueleads.com/login`** — platform users only. Email + password. Sets session with `user_type='platform'`.
2. **`{tenant-slug}.continueleads.com/login`** — tenant users only. Email + password, scoped to that tenant's `tenant_users`. Sets session with `user_type='tenant'` + `tenant_id`.

Email-based logins are scoped: a user `thiago@continueleads.com` could theoretically exist in BOTH platform_users AND multiple tenant_users tables. The login surface determines which table is checked.

### Password storage

- `bcrypt`, cost factor 12 (~250ms hash time on Fargate t4g.small — secure but tolerable)
- Argon2id considered; bcrypt chosen for native-dep simplicity and proven safety at our scale

### Session cookie

- Cookie name: `cl_session` (replaces `cl_admin_session`)
- HttpOnly, Secure, SameSite=Strict
- **12-hour expiration** (uniform across platform and tenant users for v1; configurable per tenant later)
- Raw token in cookie; SHA-256 hash stored in `sessions.token_hash`
- Cookie scoped to `.continueleads.com` so login persists across subdomains (you can use both `admin.` and `leadsquad.` after a single platform login → impersonation flow)
- When we add 2FA to platform logins (deferred), platform session can safely extend to 7 days because the second factor covers cookie-theft risk

### Impersonation

Platform users can impersonate a tenant user for support work. Mechanics:

1. Platform user clicks "Impersonate as [tenant user]" from admin UI
2. App writes `platform_audit_log` entry: `impersonation.started`
3. App creates a new tenant-typed session bound to that tenant user, sets a `cl_impersonation` flag in metadata
4. Platform user is now operating as that tenant user; can do anything that user can
5. UI banner shows "You are impersonating [user] at [tenant]" — sticky, can't be dismissed
6. "Stop impersonating" returns the platform user to their platform session
7. Every action during impersonation logged with `metadata: { impersonated_by_platform_user_id: ... }`

Impersonation is a sensitive feature. Requires logging, never silent.

### Role definitions (within a tenant)

| Role | Brands | Pages | Leads | Buyers | Users | Billing | Settings |
|---|---|---|---|---|---|---|---|
| **admin** | RW | RW | RW | RW | RW | R | RW |
| **ops** | R | R | RW | R | — | — | — |
| **sales** | R | — | R | R | — | — | — |
| **dev** | R | R | R | — | — | — | — |

(R = read, RW = read+write, — = no access)

Roles are enforced server-side in API routes via a `requireRole()` helper. Middleware does coarse-grained tenant routing; per-route checks do fine-grained role gates.

## Onboarding flow

### Creating a new tenant (platform admin action)

1. Platform admin (Thiago) opens `admin.continueleads.com/tenants/new`
2. Fills: display name, legal name (optional), slug (validated against existing tenants and reserved words), primary contact email, primary color, logo upload
3. App creates `tenants` row + sends "Welcome" email to primary contact with one-time setup link
4. Primary contact follows link → creates first `tenant_users` row with role=admin
5. First admin invites the rest of their team

### Reserved slugs

Cannot be used as tenant slugs: `admin`, `app`, `api`, `preview`, `www`, `mail`, `staging`, `prod`, `assets`, `cdn`, `docs`, `help`, `support`. Future-proof against subdomain collisions.

### Slug validation rules

- 3-30 characters
- Lowercase letters, digits, hyphens only
- Must start with a letter
- Cannot end with a hyphen
- Globally unique across all tenants

## Migration from current single-tenant state

Currently the platform has one test brand sitting in `sites`. To transition to multi-tenant:

### Migration steps (one-time, runs in a single transaction)

```sql
BEGIN;

-- 1. Create the schema (tenants, platform_users, tenant_users, sessions, audit logs)
\i migrations/005-multi-tenancy-schema.sql

-- 2. Create the "Internal" tenant for existing data
INSERT INTO tenants (id, slug, display_name, legal_name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'internal', 'Continue Leads Internal', 'Continue Leads', 'ACTIVE');

-- 3. Backfill tenant_id on every existing tenant-scoped table
ALTER TABLE sites ADD COLUMN tenant_id UUID REFERENCES tenants(id);
UPDATE sites SET tenant_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE sites ALTER COLUMN tenant_id SET NOT NULL;
-- (repeat for every table in the list above)

-- 4. Enable RLS on all tenant-scoped tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY sites_tenant_isolation ON sites FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
-- (repeat for every table)

-- 5. Create the two app DB roles
CREATE ROLE app_tenant_user;
CREATE ROLE app_platform_user BYPASSRLS;
GRANT USAGE ON SCHEMA public TO app_tenant_user, app_platform_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant_user, app_platform_user;

COMMIT;
```

### App-side changes (deployed together with the migration)

- New `lib/db-context.ts` wrapper
- Middleware reads host → resolves tenant
- All existing API routes updated to use `withTenantContext()`
- Login endpoint replaced (platform vs tenant)
- Existing HMAC cookie logic removed
- Existing `ADMIN_AUTH_SECRET` env var deprecated

### Backwards compat during transition

We don't keep the old HMAC auth working. The platform has one user (Thiago) and one test brand. We do a clean cut: deploy migration + app update together, then Thiago logs in fresh as a `platform_users` row, then verifies the test brand still visible under the Internal tenant.

## Implementation tasks (atomic, burst-sized)

This replaces Phase 0's RBAC stream from the original plan. Order matters — each builds on the previous.

### MT-1 — Schema migration (60 min)
- Write `migrations/005-multi-tenancy-schema.sql`
- Create all new tables
- Add `tenant_id` to existing tables (nullable initially)
- Run against staging
- Verify with `psql` queries

### MT-2 — DB roles + RLS (45 min)
- Create `app_tenant_user`, `app_platform_user` DB roles
- Enable RLS on every tenant-scoped table
- Write policies
- Test isolation manually with `psql` impersonating each role

### MT-3 — Backfill + NOT NULL (30 min)
- Create the "Internal" tenant row
- Backfill `tenant_id` on every existing table
- Set `tenant_id` columns to NOT NULL
- Verify via SELECT COUNT(*) WHERE tenant_id IS NULL → 0 everywhere

### MT-4 — DB context wrapper (60 min)
- Write `apps/admin/src/lib/db-context.ts`
- Export `withTenantContext()` and `withPlatformContext()`
- Add unit tests covering: tenant-scoped read, attempted cross-tenant read (must fail), platform-scoped read

### MT-5 — Subdomain routing middleware (60 min)
- Rewrite `apps/admin/src/middleware.ts` to resolve host → tenant
- Build the in-memory tenant slug cache
- Handle three cases: `admin.*`, `{slug}.*`, no/unknown host
- Update auth bypass list to handle both `admin/login` and `{slug}/login`

### MT-6 — Platform auth (login + session) (90 min)
- New route `app/api/platform-auth/login`
- bcrypt verify against `platform_users`
- Issue session, set cookie scoped to `.continueleads.com`
- Cookie reading helper
- Logout endpoint
- Seed script for first platform admin (Thiago)

### MT-7 — Tenant auth (login + session) (60 min)
- New route `app/api/tenant-auth/login` (lives at every tenant subdomain)
- bcrypt verify against `tenant_users` filtered by `tenant_id` from middleware context
- Issue session
- Logout endpoint

### MT-8 — Refactor all existing API routes (3-4 hours, can split)
- Every route in `app/api/` updated to use `withTenantContext()`
- Update `(pool as any).connect()` pattern → `withTenantContext(ctx, async (client) => { ... })`
- Remove direct `pool.query()` calls outside the wrapper
- Add `requireRole()` checks where appropriate

### MT-9 — Tenant management UI (platform-only) (90 min)
- `admin.continueleads.com/tenants` — list
- `admin.continueleads.com/tenants/new` — create form
- `admin.continueleads.com/tenants/[id]` — detail/edit
- Wires to platform routes

### MT-10 — Tenant user invitation flow (60 min)
- `{slug}/users` — list users
- `{slug}/users/invite` — invite form (admin role only)
- Email goes to the new user with one-time setup link → password setup

### MT-11 — Update CLAUDE.md (30 min)
- Document the tenant + URL + auth model
- Update commands, environment variables, login flow
- Mark old single-tenant docs as superseded

**Total estimate:** ~12-15 hours of focused work, 6-8 bursts.

## Settings JSONB structure (tenant.settings)

The `tenants.settings` JSONB field holds tenant-level feature flags and limits. Initial structure:

```jsonc
{
  "limits": {
    "max_brands": 100,
    "max_pages_per_brand": 500,
    "max_users": 10
  },
  "features": {
    "blog_enabled": true,
    "ping_post_enabled": false,           // turn on per-tenant in Phase 6
    "cost_dashboard_enabled": true,
    "custom_domain_enabled": false
  },
  "branding": {
    "favicon_url": null,
    "support_email": "support@leadsquad.com"
  },
  "alerts": {
    "telegram_chat_id": null,
    "daily_summary_enabled": false
  }
}
```

Schema-less by design — we add fields as we ship features without migrations.

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS policy bug exposes one tenant's data to another | Low | Catastrophic | Tests in CI that create two tenants, write data to each, and assert cross-tenant queries fail |
| App forgets to set tenant context → RLS denies all queries → app appears broken | Medium | Low | Fail-loud: query helper logs warning if tenant context not set; UI shows clear "no data" state |
| Subdomain DNS not provisioned before tenant onboarded | Medium | Medium | Wildcard cert + Cloudflare CNAME `*.continueleads.com` → ALB. Set once, supports all subdomains automatically |
| Cookie scoped to `.continueleads.com` allows session sharing across tenants | High | High | The cookie itself is fine; what matters is the session row maps to a specific tenant. Switching subdomains doesn't switch tenants — user is "logged into [tenant]" not "logged in everywhere" |
| Platform user accidentally writes data to wrong tenant | Medium | Medium | Platform writes against any tenant always go through `tenant_id` parameter; no implicit tenant. Audit log every cross-tenant action |
| Migration of existing single-tenant data fails | Low | Medium | Migration runs in single transaction; rollback drops every change. Test on staging clone first |

## Out of scope for v1

These are deliberately deferred:

- **Hard isolation per tenant** (separate DB instances) — premium tier feature only when a customer demands it
- **Custom domains per tenant** (`app.leadsquad.com`) — subdomain is enough for 6+ months
- **Self-serve tenant signup** — Thiago provisions tenants manually for now
- **Tenant-level billing / metering** — manual invoicing; add Stripe integration later
- **Tenant-to-tenant brand transfer** — manual SQL for now, UI later if it actually happens
- **Multi-region tenant routing** — single us-east-1 region only
- **SSO / SAML** — too small a team to justify
- **2FA** — defer until first complaint or compliance need
- **Tenant data export ("download my data")** — defer until needed

## Decisions locked (2026-05-XX)

These were resolved during the spec review:

1. **First platform user email:** `thiago@continueleads.com` (Google Workspace mailbox).
2. **First tenant slugs:** `internal` (Continue Leads' own ops), `leadsquad`, `localize` (Joe + Isis's Boston-based company).
3. **Tenant lifecycle:** two states only — `ACTIVE` and `DELETED`. `DELETED` blocks all tenant-user logins but **does NOT** stop brand sites from serving, lead capture, or any background processing. Data preserved. Platform admin (Thiago) retains full read+write access to a DELETED tenant and decides per-case what to do with pages/leads/billing/etc. No hard delete in v1 — only manual SQL for compliance/legal requests.
4. **Cookie domain:** `.continueleads.com` (covers all subdomains).
5. **Session expiration:** uniform 12 hours for both platform and tenant users in v1. Zero infra cost difference; chosen as the balance between security and login friction. Will likely revisit when 2FA lands (platform sessions can safely extend to 7 days once 2FA covers cookie-theft risk).

## What this changes elsewhere

The Phase 0 plan written 2026-05-04 needs revision:

- "Burst 0a — Secrets migration" stays first
- "Burst 0b — NEW — Multi-tenancy" inserts between secrets migration and RBAC (MT-1 through MT-11 above replace the old RBAC-1 through RBAC-6 tasks)
- "RBAC" tasks fold into MT-6/MT-7/MT-8 — they're not separate anymore, role-based access lives inside the tenant model
- Telegram, Cost dashboard, Monitoring streams unchanged

The original Master Plan needs no changes (it was high-level enough that multi-tenancy fits). CLAUDE.md needs significant updates (covered in MT-11).

## Glossary cross-reference

For future readers: when you see these in code, here's what they mean:

| Code symbol | Meaning |
|---|---|
| `tenant_id` (UUID) | Foreign key to tenants.id |
| `tenant_slug` (string) | URL-safe identifier, e.g., "leadsquad" |
| `app.current_tenant_id` (Postgres session var) | The tenant the current request is scoped to |
| `withTenantContext()` | The DB query wrapper |
| `requireRole('admin' | 'ops' | 'sales' | 'dev')` | Per-route gate |
| `requirePlatform()` | Restricts route to platform users only |
| `cl_session` | Session cookie name |
| `app_tenant_user` (DB role) | App connections that respect RLS |
| `app_platform_user` (DB role) | App connections that bypass RLS for cross-tenant work |
