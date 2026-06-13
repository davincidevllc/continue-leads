# Phase 0 Plan — Foundations (Revised)

**Status:** Draft, revised 2026-05-XX
**Owner:** Thiago + Claude
**Supersedes:** the original Phase 0 plan (branch `docs/phase-0-plan`, written 2026-05-04). That plan was written before the multi-tenancy decision; this version replaces it entirely.
**Depends on:** `multi-tenancy-spec.md`, `image-strategy.md`, `duplicate-content-detection.md`, `seo-aeo-strategy.md`, `session-protocol.md`
**Predecessor:** Phase 1 (E2E wizard + HTTPS) — DONE
**Successor:** Phase 2 (Static Site Generator + lead capture)

## Why Phase 0 exists

Phase 1 proved the wizard and page-generation pipeline work. Phase 2 starts rendering pages to live brand domains and capturing real leads. Before that, the platform needs the foundation pieces that make running anything serious in production safe and observable:

- **No way to know who did what** → audit log + RBAC
- **No way to onboard a second customer** → multi-tenancy
- **No way to know when something is broken** → monitoring + alerts
- **No way to know what we're spending** → cost dashboard
- **No way to reach the team fast** → Telegram bot
- **No way for a tenant to see anything beyond the wizard** → visible tenant dashboard
- **Sensitive values sitting in plaintext** → secrets migration

Phase 0 is the floor. Build it once, every later phase stands on it.

## What changed from the original plan

The original Phase 0 plan had four streams (RBAC, Telegram, Cost dashboard, Monitoring). The multi-tenancy decision (made 2026-05-XX) replaces the RBAC stream entirely — roles now live INSIDE tenants, and RBAC tasks become part of the multi-tenancy build.

| Old plan stream | New plan equivalent |
|---|---|
| RBAC-1 through RBAC-6 | Replaced by MT-1 through MT-11 (in `multi-tenancy-spec.md`) |
| TG-1, TG-2 (Telegram) | Unchanged, but per-tenant configurable |
| COST-1 through COST-4 | Unchanged, but per-tenant + platform-level views |
| MON-1, MON-2, MON-3 | Unchanged, but per-tenant alarm routing |
| (new) | Tenant dashboard (visible UI) |
| (new) | Secrets migration as Burst 0a |

The total Phase 0 size grew from ~12-18 hours to **~22-30 hours** across 7-9 bursts.

## The streams

| Stream | Goal | Atomic tasks | Hours |
|---|---|---|---|
| **Secrets migration** | Plaintext ECS env vars → Secrets Manager refs | 3 tasks | 2-3 |
| **Multi-tenancy** | Tenant data model + auth + RLS + onboarding | 11 tasks (MT-1 to MT-11) | 12-15 |
| **Telegram bot** | Push channel + bot infra + event taxonomy | 2 tasks | 2 |
| **Cost dashboard** | Per-tenant + platform Claude/AWS spend visibility | 4 tasks | 3-4 |
| **Monitoring** | Sentry + CloudWatch alarms + Telegram alerting | 3 tasks | 2-3 |
| **Tenant dashboard** | Make the platform visible — first thing a tenant user sees on login | 3 tasks | 3 |

## Current state (audit, 2026-05-XX)

| Concern | Today | Phase 0 target |
|---|---|---|
| Auth | Single shared HMAC password | Per-user accounts within tenants, 4 roles (admin/ops/sales/dev), audit log |
| Tenant model | Single-tenant (everything lives in one bucket) | Multi-tenant with RLS isolation; LeadSquad + Localize + Internal seeded |
| Secrets storage | Plaintext in ECS task def | Secrets Manager refs (per-tenant for provider keys, shared for platform) |
| Cookie | `secure: false`, `SameSite: lax` | `secure: true`, `SameSite: strict`, 12h expiration |
| Error tracking | None | Sentry free tier (5k events/mo), server + client, per-tenant tagging |
| Logs | `console.*` scattered | Structured logging in critical paths, queryable |
| Cost tracking | None | `api_usage` table, daily AWS snapshot, per-tenant + platform dashboards |
| Alerting | None | Telegram bot for alarms, lead events, deploy events; per-tenant routing |
| Tenant onboarding | Manual (Thiago opens a psql) | Platform admin UI: create tenant, invite first admin |
| Visible UI for tenant users | Brand list + leads list (placeholders) | Role-based home dashboard with real metrics |
| Health endpoint | None | `/api/health` returning DB ping + version + region |

## Dependency graph

```
Burst 0a — Secrets migration  (no deps; can land any time)
  │
  └─> Burst 0b — Multi-tenancy
        │
        ├─> Burst 0c — Tenant dashboard (depends on auth being wired)
        │
        ├─> Burst 0d — Telegram bot (depends on tenant settings table for per-tenant chat ID)
        │       │
        │       └─> Burst 0e — Monitoring (CloudWatch alarms route to Telegram)
        │
        └─> Burst 0f — Cost dashboard (depends on tenant model for per-tenant rollup)
```

Critical path: **Secrets migration → Multi-tenancy → everything else can parallelize.**

## Burst sequence

### Burst 0a — Secrets migration (2-3 hours)

The very first thing. We can't ship multi-tenancy on top of plaintext secrets.

**Tasks:**

- **SEC-1** — Register new ECS task def revision with `secrets:` block (60 min)
  - Move `ADMIN_AUTH_SECRET`, `DB_PASSWORD`, `PII_ENCRYPTION_KEY` from `environment:` to `secrets:`
  - Reference `cl-stg-app-secrets` Secrets Manager entry
  - Update Secrets Manager entry to have the right keys (currently has `adminAuthSecret` camelCase and unused `kmsKeyId`)

- **SEC-2** — Rotate all values during the migration (30 min)
  - Generate new strong values for all three secrets
  - Update them in Secrets Manager BEFORE deploying the new task def
  - Document new values in iCloud Keychain (per `session-protocol.md`)
  - Treat old values as compromised

- **SEC-3** — Force-deploy and verify (30 min)
  - Force new ECS deployment
  - Verify login works with new `ADMIN_AUTH_SECRET`
  - Verify DB connections still work with new `DB_PASSWORD`
  - Add tracked-issue closeout: remove the Known Issues entry about plaintext secrets

### Burst 0b — Multi-tenancy foundation (12-15 hours, can split into 2-3 sub-bursts)

All 11 tasks from `multi-tenancy-spec.md`. Recommend grouping:

**Sub-burst 0b.1 — Schema + isolation (3 hours)**
- MT-1: Schema migration
- MT-2: DB roles + RLS
- MT-3: Backfill + NOT NULL

**Sub-burst 0b.2 — Auth + routing (4 hours)**
- MT-4: DB context wrapper
- MT-5: Subdomain routing middleware
- MT-6: Platform auth (login + session)
- MT-7: Tenant auth (login + session)

**Sub-burst 0b.3 — API refactor + tenant management (4-5 hours)**
- MT-8: Refactor all existing API routes
- MT-9: Tenant management UI
- MT-10: Tenant user invitation flow

**Sub-burst 0b.4 — Documentation (30 min)**
- MT-11: Update CLAUDE.md

### Burst 0c — Tenant dashboard (3 hours)

The visible-UI need. After multi-tenancy is in, the first thing a tenant user sees on login should look like a product.

**Tasks:**

- **DASH-1** — Role-based home dashboard (90 min)
  - `{tenant}/dashboard` — role-aware view
  - **Admin sees:** brand count, leads today (mock until Phase 5), recent activity, system health card
  - **Ops sees:** QA queue, pending reviews (mock), recent leads
  - **Sales sees:** lead pipeline (mock), revenue (mock until Phase 5/6)
  - **Dev sees:** job queue stats, recent deploys
  - Mobile-first layout
  - Visual polish — this is the "demo to a partner" page

- **DASH-2** — Brand status grid (60 min)
  - List brands the tenant owns
  - Per-brand: status, page count, last activity, indexability state
  - Visual status indicators (colored chips)

- **DASH-3** — System health card (30 min)
  - Shows: DB connectivity, recent error rate (from Sentry once wired), last deploy time
  - Visible to all roles (everyone benefits from "is the system happy")

### Burst 0d — Telegram bot (2 hours)

Per `seo-aeo-strategy.md`-adjacent decisions: Telegram, not WhatsApp; AWS Lambda for the bot.

**Tasks:**

- **TG-1** — Bot setup + per-tenant secrets (60 min)
  - Create platform-level Telegram bot via @BotFather
  - One bot serves all tenants; each tenant configures their own chat ID
  - `tenants.settings.alerts.telegram_chat_id` per tenant
  - Bot token in platform Secrets Manager (`cl-stg-platform-secrets`)
  - Per-tenant routing: bot reads tenant_id from event, looks up chat ID, sends

- **TG-2** — Sender library + event taxonomy (60 min)
  - `apps/admin/src/lib/telegram.ts` — `sendAlert(tenantId, level, title, body, metadata?)`
  - Levels: `info`, `warn`, `error`, `critical`
  - Event taxonomy:
    - `LEAD_CAPTURED` — info
    - `DEPLOY_STARTED` / `DEPLOY_COMPLETED` / `DEPLOY_FAILED`
    - `ERROR_RATE_SPIKE` — critical (from MON-3)
    - `COST_THRESHOLD_BREACHED` — warn/critical
    - `BRAND_CREATED` — info
    - `GENERATION_FAILED` — error
    - `IMAGE_BATCH_AWAITING_APPROVAL` — info (per `image-strategy.md`)
  - Rate limiting (max N alerts of same type per 5 min) prevents Telegram-bombing during incidents
  - Failure mode: telegram outage must NOT break the request; log + continue

### Burst 0e — Monitoring (2-3 hours)

**Tasks:**

- **MON-1** — Sentry integration (45 min)
  - `@sentry/nextjs` install + config
  - Free tier sufficient (5k events/mo)
  - Server + client config; source maps from CI
  - Tagged with `tenant_id` per request for filtering
  - DSN in Secrets Manager

- **MON-2** — Health endpoint (20 min)
  - `GET /api/health` — public, no auth
  - Returns: `{ status, version, region, db: 'ok' | 'fail', timestamp }`
  - DB check: `SELECT 1` with 1s timeout
  - Used by ALB health checks + external uptime monitor (UptimeRobot free tier)

- **MON-3** — CloudWatch alarms → Telegram (60 min)
  - CloudFormation: ALB 5xx > 1% over 5 min, RDS connections > 80%, ECS task fail count > 0
  - SNS topic → Lambda → calls TG-2 sender library
  - Platform-level alerts go to your personal Telegram; tenant-level alerts go to tenant chat
  - Test each alarm by intentionally breaking it once

### Burst 0f — Cost dashboard (3-4 hours)

**Tasks:**

- **COST-1** — `api_usage` schema (30 min)
  - `api_usage` table (tenant_id, provider, model, input_tokens, output_tokens, cached_input_tokens, cost_usd, request_id, brand_id, created_at)
  - RLS per multi-tenancy spec
  - Indexes: tenant_id + created_at desc, brand_id

- **COST-2** — Claude API wrapper with cost tracking (60 min)
  - `apps/admin/src/lib/anthropic.ts` wraps `anthropic.messages.create()`
  - Captures usage from response; computes cost from model pricing
  - Writes `api_usage` row after every call
  - Re-export wrapper everywhere; lint rule blocks direct SDK use
  - Note: actual usage starts in Phase 3 (Content Agent)

- **COST-3** — AWS daily cost snapshot (60 min)
  - Scheduled Lambda calls AWS Cost Explorer API daily
  - Stores last 30 days in `aws_cost_daily` (date, service, cost_usd, tenant_attributable)
  - Tenant attribution: best-effort by tagging — needs Phase 3 follow-up to make complete
  - Triggers Telegram alert if daily spend exceeds tenant or platform threshold

- **COST-4** — Cost dashboard UI (60 min)
  - **Tenant view** (`{tenant}/cost`): their own Claude spend, image gen spend (Flux paid by them but tracked for visibility), pro-rated AWS attribution
  - **Platform view** (`admin.continueleads.com/cost`): all-tenants rollup; total spend; per-tenant breakdown
  - Charts: 30-day spend, per-provider breakdown, per-brand attribution
  - Threshold config UI for both per-tenant and platform-level alerts

## Phase 0 exit criteria

Phase 0 is done when ALL of these are true:

- [ ] No plaintext secrets in any ECS task definition. All sensitive values come from Secrets Manager.
- [ ] Two tenants exist in the platform: `internal` (seeded), `leadsquad` (provisioned), `localize` (provisioned placeholder)
- [ ] Logged-out users see the appropriate `/login` for everything except `/api/leads/capture` and the public-facing brand sites
- [ ] Login requires email + password — no shared secret in code
- [ ] Roles enforced at the API level — a Sales user cannot DELETE a brand
- [ ] All login/logout/admin actions appear in the appropriate audit log
- [ ] `secure: true` cookie + HTTPS confirmed end-to-end + `SameSite=strict`
- [ ] Sentry receives a deliberately-thrown error from staging, tagged with tenant_id
- [ ] CloudWatch 5xx alarm triggers Telegram message within 60 seconds
- [ ] Cost dashboard shows yesterday's actual Claude + AWS spend (per-tenant + platform)
- [ ] Telegram bot has fired at least one of each level (info, warn, error)
- [ ] `/api/health` returns 200 with `db: 'ok'`
- [ ] Tenant user logs in and sees a real-looking dashboard, not just empty tables
- [ ] Platform admin can create a new tenant via UI in < 2 minutes
- [ ] Tenant admin can invite a tenant user via UI; the invitee receives an email and can set their password
- [ ] CI runs a cross-tenant isolation test that passes
- [ ] CLAUDE.md updated to reflect Phase 0 changes

## Recommended burst sequence

For ~7-9 sessions of 1.5-3 hours each:

| Session | Burst | Outcome |
|---|---|---|
| 1 | 0a (secrets migration) | No more plaintext secrets. Foundation for everything else. |
| 2 | 0b.1 (multi-tenancy schema + isolation) | DB-level isolation in place; tests passing |
| 3 | 0b.2 (auth + routing) | Email + password login working for platform admin and one seeded tenant |
| 4 | 0b.3 (API refactor + tenant mgmt UI) | Multi-tenancy end-to-end; new tenants can be provisioned |
| 5 | 0b.4 + 0c (docs + tenant dashboard) | Tenants log in and see a real-looking product |
| 6 | 0d + 0e (Telegram bot + monitoring + health) | Push channel + Sentry + alarms all live |
| 7 | 0f (cost dashboard) | Per-tenant + platform spend visible |
| 8 (cleanup) | Tracked-issue mop-up; refresh CLAUDE.md "Last Session" | Phase 0 closes; ready for Phase 2 |

**Total estimate: 22-30 hours of focused work.**

## Decisions to confirm before specific bursts start

These were called out in the spec docs but worth restating here:

- **bcrypt cost factor 12** for password hashing — confirmed in `multi-tenancy-spec.md`
- **Session token strategy** — opaque random tokens in `sessions` table, not JWT (server-side revocable). Confirmed.
- **Telegram channel structure** — one bot, per-tenant chat IDs. Recommend each tenant uses ONE channel for everything initially; split later if noise warrants.
- **Cost alert thresholds** — recommend defaults at $10 Claude / day (warn), $25 Claude / day (critical), per tenant. Platform-level: $50 Claude / day (warn), $100 Claude / day (critical). Tunable from cost dashboard UI.
- **Sentry tier** — free tier (5k events/mo) sufficient for staging. Bump to paid only on actual usage signal.
- **First platform user** — `thiago@continueleads.com` per `multi-tenancy-spec.md`
- **First tenant slugs** — `internal`, `leadsquad`, `localize`

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Secrets migration breaks staging | Medium | High | Test on a non-prod tenant first; have rollback plan (revert task def revision) |
| Multi-tenancy migration locks out existing test brand | Low | Low | Test brand backfills to `internal` tenant; verified via post-migration query |
| RLS policy bug exposes cross-tenant data | Low | Catastrophic | Mandatory CI cross-tenant isolation tests |
| Telegram bot token leaks in logs | Low | High | Validate `lib/telegram.ts` redacts token from any error string |
| Sentry burns through free tier | Medium | Low | Sample rate 10% in production, 100% in staging |
| Cost alarms fire too often | Medium | Low | Snooze controls; daily digest by default; rate limiting in TG-2 |
| Tenant dashboard shows mocked data and looks fake to LeadSquad | Medium | Medium | Be explicit: dashboard shows real metrics where they exist, "Coming soon" where they don't |

## What this DOESN'T include

Deferred to later phases:

- **Self-serve tenant signup** — Thiago provisions tenants manually for v1
- **Stripe billing integration** — manual invoicing; build proper billing in v2
- **2FA** — defer until first complaint or compliance need
- **Email-based password reset** — defer until we have email-sending infra in Phase 4
- **SSO / SAML** — too small a team to justify
- **Custom domains per tenant** — subdomain enough for 6+ months
- **Per-brand RBAC** (granular tenant_user-to-brand permissions) — defer
- **Distributed tracing** — defer to when we have load
- **All Phase 2-7 work** — Phase 2 starts only after Phase 0 exit criteria are met

## Open questions for Thiago

- [ ] Telegram personal account or new dedicated Continue Leads account for the bot? Recommend dedicated (cleaner separation).
- [ ] Joe / Isis Telegram joining cadence — do you want them in the Localize alert channel from day 1, or wait until Phase 5 lead alerts start firing meaningfully?
- [ ] LeadSquad onboarding — when do you actually provision their tenant? Before or after Localize? Affects which tenant is the "first real one" we test the onboarding flow against.
- [ ] First-tenant dashboard demo — should the seed data for LeadSquad include sample brands so the dashboard looks alive on first login? (My rec: yes, seed 1-2 demo brands in `DRAFT` status.)

## What to read before starting any burst

- The relevant spec doc(s):
  - Burst 0a: `multi-tenancy-spec.md` (secrets section), Known Issues in CLAUDE.md
  - Burst 0b: `multi-tenancy-spec.md` (entire doc)
  - Burst 0c: `seo-aeo-strategy.md` (trust signal kit — applies to dashboard polish)
  - Burst 0d/0e/0f: this doc
- The latest "Last Session" block in CLAUDE.md
- The `session-protocol.md` opener

When in doubt: ask Claude to read CLAUDE.md and the relevant spec, then summarize where things stand. 90 seconds, no re-discovery needed.
