# Continue Leads — Claude Code Context

> **Read this file in full before doing anything else.**
> Last updated: 2026-06-15

## Project

**Continue Leads is a multi-tenant SaaS platform** for programmatic local-SEO lead generation. Each tenant (customer company) operates their own set of "brands" — lead-gen-front websites that capture homeowners' contact info via city × service combination "money pages." Each page gets a unique AI-generated body. Leads are captured through embedded forms and sold via a real-time ping-post auction to contractors and aggregators.

**Current tenants (planned):**
- `internal` — Continue Leads' own ops / R&D
- `leadsquad` — Tampa partners running their own lead-gen
- `localize` — Joe + Isis's Boston-based operation, Localize

Thiago (you) is a platform owner and also a partner at LeadSquad + Localize. The platform is designed so YOU can walk away from any partnership and the platform travels with you.

**Core spec docs** (read before working on the related area):
- [`docs/multi-tenancy-spec.md`](./docs/multi-tenancy-spec.md) — tenant model, RLS isolation, auth, URLs
- [`docs/seo-aeo-strategy.md`](./docs/seo-aeo-strategy.md) — on-page kit, sitewide elements, blog, AEO patterns, schema, trust signals, TCPA
- [`docs/duplicate-content-detection.md`](./docs/duplicate-content-detection.md) — Voyage embeddings, pgvector, QA integration, dashboard views
- [`docs/image-strategy.md`](./docs/image-strategy.md) — per-tenant Flux pools, anti-clustering rules, approval workflow
- [`docs/phase-0-plan.md`](./docs/phase-0-plan.md) — current phase: 7 streams, 22-30 hours, see for next task
- [`docs/session-protocol.md`](./docs/session-protocol.md) — how to start and end a session efficiently

## Repo & Environment

- **Active local path:** `~/Downloads/continue-leads`
- **GitHub:** `github.com/davincidevllc/continue-leads`
- **Live admin (staging):** `https://admin.continueleads.com` — HTTP→HTTPS 301 redirect; ACM cert auto-renews, expires 2026-11-17. Backend ALB hostname is `cl-stg-admin-alb-1165576223.us-east-1.elb.amazonaws.com` (don't hit directly; cert is bound to the friendly name).
- **Hosting:** AWS only (ECS Fargate, RDS PostgreSQL, ALB, S3, CloudFront, ACM). No DigitalOcean.
- **DNS:** `continueleads.com` registered at name.com, **DNS delegated to Cloudflare** (`pat.ns.cloudflare.com`, `pete.ns.cloudflare.com`). All record changes go in Cloudflare dashboard, not name.com or Route 53. Email (Google Workspace MX) and admin subdomain are both there. ACM validation CNAMEs go in Cloudflare with **proxy off (gray cloud)**; orange cloud breaks ACM and direct ALB connections.
- The `~/Desktop/continue-leads-cms/` directory on this machine is a **deprecated prototype** — do not edit, do not reference.

## Stack

- **Frontend/Admin:** Next.js 15 (App Router), React 19, TypeScript strict
- **Monorepo:** pnpm workspaces + Turborepo
- **Database:** PostgreSQL on AWS RDS (private subnet, SSL required)
- **Backend services:** Node.js + Express scaffolds in `services/ingestion/` and `services/pingpost/` (not yet wired)
- **Queue:** AWS SQS (planned) + DB `generation_jobs` table (existing)
- **Auth:** HMAC cookie (`cl_admin_session`), 7-day duration, single shared password — **no RBAC yet**
- **CI/CD:** GitHub Actions on push to `main`, builds Docker → ECR → ECS
- **DB connection:** `apps/admin/src/lib/pool.ts` — direct `pg` Pool with SSL

## Key Commands

```bash
pnpm install            # install deps (run from repo root)
pnpm build              # full build (turbo)
pnpm test               # vitest
pnpm db:migrate:staging # run migrations against staging RDS
git push origin <branch> && open PR  # triggers CI; deploy on merge to main
```

Admin app dev server (from repo root):
```bash
pnpm --filter @continue-leads/admin dev   # localhost:3000
```

## Architecture Patterns

- API routes live at `apps/admin/src/app/api/`.
- Always `import pool from '@/lib/pool'`.
- Transactions: `const client = await (pool as any).connect()` then `BEGIN`/`COMMIT`/`ROLLBACK` in `try`/`catch`/`finally`.
- All API routes export `export const dynamic = 'force-dynamic'`.
- TypeScript strict mode. Avoid `any` except the `(pool as any).connect()` pattern (legacy `pg` types issue).
- Mobile-first UI: build mobile layout first, layer in Tailwind `md:`/`lg:` breakpoints after.

### Naming gotcha (important)

- DB table: **`sites`** (legacy name).
- API + UI surface: **`/api/brands`**, "Brand Launch Wizard," "brand."
- Treat them as synonyms — when reading code, "site" and "brand" are the same entity. Don't rename either yet.

## Current Priorities (do these in order)

**Phase 1 — Validation (DONE 2026-05-04)**
- ✓ E2E Wizard test passed against staging
- ✓ Auth bypass tightened (PR #2 — only `/login`, `/api/auth/*`, `/api/leads/capture` are public now)
- ✓ DNS + HTTPS — `https://admin.continueleads.com` live with valid ACM cert and HTTP→HTTPS redirect

**Phase 0 — Foundation (current focus)**
Plan: see `docs/phase-0-plan.md` (revised 2026-05-XX, ~22-30 hours across 7-9 bursts).

Stream sequence — strict order:

1. **Burst 0a — Secrets migration** (2-3h). Move `ADMIN_AUTH_SECRET`, `DB_PASSWORD`, `PII_ENCRYPTION_KEY` from plaintext ECS task def to Secrets Manager refs. Rotate during migration.
2. **Burst 0b — Multi-tenancy** (12-15h, splits into 4 sub-bursts). Full multi-tenant model: schema + RLS + auth + tenant management UI. See `docs/multi-tenancy-spec.md` for 11 atomic tasks (MT-1 through MT-11).
3. **Burst 0c — Tenant dashboard** (3h). First visible UI a tenant user sees on login. Role-based metrics view; makes the platform look like a product.
4. **Burst 0d — Telegram bot** (2h). One platform bot, per-tenant chat IDs.
5. **Burst 0e — Monitoring** (2-3h). Sentry + CloudWatch alarms + Telegram routing.
6. **Burst 0f — Cost dashboard** (3-4h). Per-tenant Claude/Flux/AWS spend visibility + platform rollup.

**Critical path:** Secrets migration → Multi-tenancy → everything else can parallelize.

The old RBAC stream from the previous Phase 0 plan is REPLACED by the multi-tenancy work — roles now live inside tenants. Don't reach for the old `docs/phase-0-plan` branch (now superseded).

**Phase 2 — Static Site Generator v1**
8. Render `site_pages` rows to S3 as static HTML with full SEO layer (canonicals, schema, sitemap, robots, OG, GA4, GSC verification, UTM passthrough).
9. Forms infrastructure — own endpoint, TCPA consent above submit, honeypot, rate limit, dedup check.
10. Staging vs production split — staging at `preview.continueleads.com/[brand-id]/`, production at the brand domain. No promotion without manual approval.

**Phase 3 — Content Agent v1**
11. Job worker for `GENERATE_CONTENT` jobs, calls Claude API (Sonnet, current version) with prompt caching enabled, writes to `site_pages.content_blocks`.

**Phase 4 — QA Agent v1**
12. Word count, similarity (≥ 85% flag), required sections check, writes `qa_runs` + `qa_findings`. Manual sample review of 25 pages required before `indexing_mode` flip. **Reviewer: Thiago (for now).**

**Phase 5 — Lead Management** (parallelizable with 3/4)
13. Lead capture lifecycle, dedup window **30 days** on phone+ZIP+vertical, automated validation, daily revenue email.

**Phase 6 — Ping-Post**
14. Buyer onboarding, ping/post endpoints, auction logic, sandbox env for buyer integration.

**Phase 7 — Agent Activity Dashboard**

## Hard Rules

- **NEVER** flip `indexing_mode` to `indexable` without: QA run passed, noindex confirmed in HTML + robots.txt + X-Robots-Tag, 25-page manual sample sign-off recorded.
- **NEVER** ship a form without TCPA consent language above the submit button.
- **NEVER** reuse content across pages — every page gets its own Claude API call.
- **NEVER** invent layout decisions not shown in the Figma design. If a Figma element is ambiguous, list questions before building.
- **NEVER** use a third-party form service (Typeform, Formspree, etc.) — all leads POST to our own endpoint.
- **NEVER** hotlink images — always served via CloudFront, WebP, max 200KB, responsive srcset.
- **ALWAYS** run lead deduplication before inserting a lead record (30-day window on phone+ZIP+vertical).
- **ALWAYS** show estimated Claude API cost before a batch starts; require typed confirmation if estimate > $0 (raise threshold once trust is built).
- **ALWAYS** mobile-first: build mobile layout, then layer desktop breakpoints.
- **ALWAYS** include GA4 + UTM passthrough on every rendered page.

## Decisions Log

Decisions made during the kickoff session (2026-05-02). Revisit if assumptions change.

| Decision | Value | Notes |
|---|---|---|
| Domain pattern | One domain per brand (e.g., `paintsmiths.com`), city/service as paths: `/[city]/[service]` | Already reflected in `slug_strategy_config` defaults in `/api/brands` POST |
| Lead dedup window | 30 days | Phase 5 |
| QA similarity threshold | 85% | Phase 4 |
| Manual reviewer | Thiago (single reviewer for now; expand later) | Phase 4 |
| Cost guardrail threshold | $0 — every batch requires typed confirmation | Phase 0/3 |
| Content model | Claude Sonnet (current stable) + prompt caching on shared system prompt; configurable per batch | Phase 3 |
| Team comms | Telegram bot (Bot API) — not WhatsApp, not Discord | Phase 0 |
| Monitoring | CloudWatch alarms (infra) + Sentry free tier (app exceptions) | Phase 0 |
| Branch policy | Branch + PR for any change touching 2+ files or production paths. Direct push to main only for typo/comment-only fixes | All work |
| Working dir | `~/Downloads/continue-leads` | Confirmed 2026-05-02 |
| DNS provider | Cloudflare (delegated from name.com registrar). All record changes in Cloudflare. ACM validation + ALB CNAMEs use **proxy off (gray cloud)** | Discovered 2026-05-04 — initially assumed Route 53. Email already on Cloudflare so migrating away would orphan MX. |
| TLS strategy (admin) | ACM cert + ALB-terminated TLS, direct user → ALB (no Cloudflare proxy). HTTP:80 listener 301-redirects to HTTPS | Phase 1 close. Brand sites in Phase 3 may proxy through Cloudflare for WAF; admin stays direct. |
| Git identity (commits) | `Thiago DeSouza <thiago@continueleads.com>` | Configured 2026-05-04 globally on this machine. Past commits with `@Thiagos-MacBook-Pro-2.local` left untouched (already merged). |
| **Platform model** | Multi-tenant SaaS; LeadSquad + Localize + future are tenants | 2026-05-XX — fundamental architecture pivot from single-tenant assumptions |
| **Tenant code term** | `tenant` (not `account`, not `company`) | 2026-05-XX — chosen to avoid collisions with "account" and "company" elsewhere |
| **Isolation strategy** | Postgres Row-Level Security (RLS) + tenant-scoped DB roles | DB enforces; app code can't accidentally leak cross-tenant data |
| **URL structure** | `admin.continueleads.com` for platform admin, `{slug}.continueleads.com` per tenant | Wildcard ACM cert needed |
| **Session expiration** | 12 hours, uniform for platform and tenant users | Will lift to 7d for tenant + 2FA-gated 7d for platform when 2FA lands |
| **Tenant lifecycle** | Two states: ACTIVE, DELETED. DELETED blocks tenant-user login but everything else keeps running; platform admin retains full access | Manual SQL only for hard delete |
| **Image generation** | Flux schnell via API; each tenant brings their own API key | DALL-E 3 considered for future quality upgrade |
| **Image pool ownership** | Per-tenant per-vertical (v1); per-brand (v2 when brand is spun up) | No cross-tenant image sharing — every tenant pays for and owns their own imagery |
| **Image approver** | Per-tenant assigned user: LeadSquad = one of their partners, Localize = Gerry, default = tenant Admin | Sample review of 10% per batch |
| **Five-star display** | Decorative stars with framing like "Quality Service Guaranteed" — no rating-count claim | FTC-defensible posture; deferred reviews collection to v2 |
| **TCPA consent UX** | "By clicking" implied consent (no checkbox) above submit button | Stronger legal posture than checkbox |
| **Duplicate detection** | Voyage `voyage-3-lite` embeddings + pgvector; 0.85 block / 0.75 warn thresholds | Per-tenant tunable; cross-tenant comparison explicitly OFF |
| **Off-page SEO** | Out of scope for v1 (brands are lead-gen fronts, not real businesses) | Revisit when we have enterprise tenant wanting branded sites |
| **Blog content source** | AI-only initially; per-brand toggle (AI / hybrid / human) added in future | Cadence: 2-4 posts/week per brand |
| **Domain ownership** | Thiago personally owns all brand domains by default (sticky leverage); tenant can opt to own their own | Transferable later via platform admin action |
| **Email forwarding for brand domains** | ImprovMX catch-all v1; AWS SES + Lambda parser for v2 (email-as-lead) | Free tier covers first 25 domains |
| **Embedding storage** | pgvector inside existing RDS — no separate vector DB | Zero infra cost |
| **Approval workflow** | Auto-generation + required tenant-level approval before images go usable | Per-tenant approver |
| **Secrets storage (staging)** | `cl-stg-app-secrets` JSON with keys `ADMIN_AUTH_SECRET`, `DB_PASSWORD`, `PII_ENCRYPTION_KEY`. ECS task def `cl-stg-admin:53+` references via `secrets:` block. Execution role `cl-stg-admin-exec-role` has `secrets-access` inline policy granting `secretsmanager:GetSecretValue` on the secret. | Burst 0a complete 2026-06-12. All three values rotated during migration; old values treated as compromised. New values backed up in iCloud Keychain under `CL — Staging *` entries. |
| **Canonical migration system** | `packages/db/migrations/*.sql` (with `schema_migrations` tracking, wired to `pnpm db:migrate:*`). Use this for ALL new migrations going forward. | 2026-06-13. The legacy `/migrations/` raw SQL system also has tables live on staging; consolidation tracked as a Known Issue. |
| **Internal tenant seed UUID** | `00000000-0000-0000-0000-000000000001` (fixed for reproducibility across environments and tests). | 2026-06-13 — seeded in `0005_multi_tenancy_backfill.sql`. |

## Open Business Questions (unresolved)

These block specific phases. Don't start the dependent phase without an answer.

- **TCPA consent copy** (blocks Phase 2): using a placeholder draft until attorney-approved language lands.
- **Launch scope** (no immediate blocker): README says Painting + Cleaning + Siding × 5 metros = 15 brands. Master Plan says start with Painting/MA only. Decide before bulk content generation.
- **`cap_config.max_pages` default** (informational): schema default is 500, "Wave 1 Launch Defaults Addendum" referenced in old docs apparently changed it to 250. Addendum not yet located. Leaving 500 until confirmed.
- **Telegram bot infra location** (Phase 0): Lambda vs small ECS task — decide when we start the bot.
- **Buyer dispute / return policy** (Phase 6).
- **Ping timeout window** (Phase 6).
- **Ping-post auction tie-breaking rule** (Phase 6).
- **Bid floor per vertical** (Phase 6).

## Database

- **Geography (seeded):** 51 states, 3,128 counties, 27,607 cities, 31,459 ZIPs.
  - `cities.population` **is seeded** (verified 2026-05-03 — Boston shows pop. 675,647). Used by `/api/brands/[id]/generate-pages` to rank cities for cap selection.
- **Taxonomy (seeded):** 1 vertical (Home Improvement), 62 categories, 207 services, 90 question sets.
- **Built schema (M001-M004):**
  - `sites`, `site_target_states`, `site_target_counties`, `site_target_zips`, `site_target_cities`
  - `site_pages` (page_type ∈ HOME/SERVICE/CITY/MONEY/LEGAL/BLOG_INDEX/BLOG_POST)
  - `generation_jobs`, `generation_job_items` (job_type ∈ DERIVE_CITIES/GENERATE_CONTENT/RENDER_PAGES/BUILD_BUNDLE/PUBLISH)
  - `qa_runs`, `qa_findings`
  - `templates`, `verticals`, `categories`, `services`, `question_sets`
- **Not yet built:** `leads`, `buyers`, `lead_bids`, `lead_distributions`, `users`/`roles` (RBAC).
- **Migration pattern:** raw SQL in `migrations/`, run via `pnpm db:migrate:*` or temporary `POST /api/migrate` endpoint with bearer token.

## Assets

See `docs/image-strategy.md` for the full spec. Quick summary:

- **Brand logos:** provided by Gerry per brand (or whichever designer the tenant uses) → `s3://cl-images/{tenant-slug}/brands/{brand-id}/logo.webp`. Manual delivery, one per brand.
- **Page images:** AI-generated per tenant per vertical via Flux schnell API. Each tenant brings their own Flux API key. Pool of 200 images per tenant per vertical, refreshed quarterly. Tenant approver reviews 10% sample before images go usable. Storage: `s3://cl-images/{tenant-slug}/{vertical-slug}/[uuid].webp`.
- All assets via CloudFront, WebP, max 200KB, responsive srcset auto-generated.
- Anti-clustering rules enforced in page assignment so the same image never appears on too many pages within a brand.

## Team

### Platform level (Continue Leads)

- **Thiago** — founder, platform owner, technical lead. Working with you (Claude Code). Platform User (super-admin across all tenants). Also partner at LeadSquad + Localize.

### Tenants and tenant users

- **`internal` tenant** — Continue Leads' own ops. Thiago is the only user.
- **`leadsquad` tenant** — Tampa partners (names TBD). The LeadSquad partners run lead-gen via the platform; one of them is the assigned image approver for that tenant.
- **`localize` tenant** (Localize, Joe + Isis's Boston-based company):
  - **Joe** — sales/BD. Role: Sales (read-only leads + revenue dashboard).
  - **Isis** — ops director candidate. Role: Ops (QA review, lead management, brand status).
  - **Gerry** — image approver only (designer in Philippines, also delivers brand logos + Figma page designs for tenants that contract him).

### Shared contractors (used by tenants that hire them)

- **Gerry** — UI/UX (Figma, Philippines). Delivers brand logos (per brand), page template designs (per vertical), image batch approval for tenants where he's the assigned approver. NOT platform staff — he's contracted by individual tenants.
- **2 full-stack devs** (Philippines, via Outsourcey). Dev role within whichever tenant contracts them. Could also be platform contractors helping Thiago directly.

## Telegram Bot (Phase 0, not built)

- Telegram Bot API (no business verification needed; instant setup).
- Hosting: AWS Lambda (decide vs small ECS task at build time).
- **Outbound (proactive alerts to team group):**
  - New qualified lead
  - Brand goes live
  - Content batch completed (X pages, $Y actual cost)
  - QA failure digest (daily)
  - Failed job alert (immediate)
  - Daily revenue summary (every morning)
- **Inbound (queries from Thiago):**
  - "How many leads today?" → count by vertical
  - "Status of [brand name]?" → current pipeline step
  - "Cost for last batch?" → Claude API spend
  - "Any failed jobs?" → list

## Working Style (non-negotiable)

- **Always show a plan** before writing code on any task that touches 2+ files.
- **Read CLAUDE.md** in full at the start of every session before doing anything else.
- After completing a unit of work, state clearly: what you built, what you decided, what's next.
- If you hit a blocker you can't resolve in 2 attempts, **stop and describe it** — don't keep guessing.
- Never modify existing API routes unless explicitly told to.
- Commit after each completed unit of work with a clear, descriptive message (`feat(scope): ...`, `fix(scope): ...`).
- Update the **Last Session** block at the bottom of this file before stopping each day.
- For UI tasks: always read the Figma frame URL provided before writing markup. If anything in the design is unclear, list questions — never guess.

### Model selection

- **Claude Sonnet (current)** — default for ~80% of work.
- **Claude Opus** — switch (`/model opus`) for large architectural decisions or multi-file refactors.
- **Claude Haiku (current)** — option for simple/repetitive content batches if cost matters more than quality.

## Known Issues / Tracked Cleanup

- **Dual migration systems** (discovered 2026-06-13). Two parallel SQL migration paths exist in the repo:
  1. **Canonical:** `packages/db/migrations/` with `schema_migrations` version tracking, wired to `pnpm db:migrate:*` scripts (modern, properly idempotent). Files: `0001_init.sql`, `0002_seed_launch_data.sql`, and Burst 0b.1's `0003_multi_tenancy.sql`, `0004_multi_tenancy_rls.sql`, `0005_multi_tenancy_backfill.sql`.
  2. **Legacy:** `/migrations/` raw SQL files invoked by standalone `run-migration.js` (no version tracking). Files: `001-taxonomy-overhaul.sql` through `004-pages-jobs-qa.sql`.
  Both have been applied to staging. The app uses tables from both — `metros`, `sites`, `leads`, etc. from canonical; `site_pages`, `site_target_*`, `generation_jobs`, `qa_runs`, `blog_posts` from legacy. **Going forward: all new migrations land in `packages/db/migrations/`.** The legacy directory should be consolidated (rewritten as canonical migrations) in a future cleanup pass. Multi-tenancy migrations are designed to work with both systems live (legacy tables guarded by `EXISTS` checks).
- **`cl-stg-db-credentials` Secrets Manager entry is incomplete** — it has `host`, `port`, `dbname`, `username` but no `password`. The app reads `DB_PASSWORD` from `cl-stg-app-secrets` instead. Either (a) sync the current password into this secret so it's a complete connection record, or (b) delete this orphan secret entirely. Future improvement: refactor the app to read all four DB connection values from one secret instead of mixing env + secret. Low priority.
- **Session cookie still `secure: false`** in `apps/admin/src/lib/auth.ts:39`. Legacy from HTTP-era staging. Now that HTTPS is enforced (Phase 1 closed 2026-05-04), flip to `secure: true` so the cookie won't transmit over plain HTTP. Small one-file PR. Will be folded into Phase 0 RBAC-2 if not done sooner.
- **Session cookie `SameSite=lax`** — Phase 0 RBAC-2 should bump to `SameSite=strict` for the admin app (no cross-site embeds expected).
- **Cruft directories** at repo root from past botched shell commands: `apps/for/`, `dir/`, `its/`, `{apps/`. Each contains files literally named `placeholder` and `cat > `. Clean up in a dedicated tidy commit when not mid-feature.
- **`cap_config.max_pages`** default of 500 may be wrong per missing Wave 1 Addendum.
- **Bootstrap vs Tailwind in admin UI** — README says Bootstrap, Master Plan implies Tailwind. Verify which is in `apps/admin/` before any UI build task.
- **Empty/malformed POSTs return HTTP 500** on `/api/auth/login` and `/api/leads/capture` — should return 400. Pre-existing, unrelated to recent changes. Hardening task.
- **No `DELETE /api/brands/[id]` endpoint** — `DELETE /api/brands/[id]/pages` exists, but no way to delete a brand record itself via HTTP. Test brand `cl-e2e-painting-ma-20260503.com` (id `68adfd7a-42b4-48e8-9be0-b338cdcbbaa9`) is sitting in staging as a test artifact. Add endpoint when convenient.
- **Dead validation CNAME at name.com** — during Phase 1 DNS work, an ACM validation CNAME was added at name.com before discovering DNS is at Cloudflare. The record at name.com is inert (nameservers point to Cloudflare). Delete on next visit to name.com DNS panel.
- ~~**`gh` CLI not installed locally**~~ → installed 2026-06-13 via official `.pkg` (v2.94.0), authenticated via `gh auth login` with token in macOS Keychain. PRs now open via `gh pr create`.

## Last Session

**Session: 2026-06-15 — In-person apply day. All 8 PRs from the 2026-06-13 mobile-dispatch backlog landed. Platform login is LIVE on staging.**

What was accomplished today (the apply playbook from the 2026-06-13 session, executed):

### Auxiliary services set up (Phase A)

- **Sentry signup** — org `davinci-dev`, project `cl-staging-admin`, free tier (5k events/mo). Linked to `davincidevllc/continue-leads` repo for stack-trace source context. DSN: `https://6ec8456...@o4511563900518400.ingest.us.sentry.io/4511563913560064`.
- **BotFather** — created `@cl_staging_alerts_bot` (display: "Continue Leads Staging Alerts"). Bot token + chat ID `775937110` (Thiago's personal Telegram) added to `cl-stg-app-secrets`. Verified live with `sendMessage` curl.
- **5 new keys in `cl-stg-app-secrets`**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT=staging`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_PLATFORM_CHAT_ID`. Edited via Console plaintext editor — see Known Issue below about the malformed-JSON near-miss.

### CI fixes + 7 PR merges (Phase B)

The 8 PRs from the 2026-06-13 mobile-dispatch session had three classes of CI failure (none caught during mobile dispatch because no Node toolchain):

| Class | Affected PRs | Cause | Fix |
|---|---|---|---|
| Lockfile mismatch | #11, #12, #9 | `package.json` got new deps via Edit, but `pnpm-lock.yaml` wasn't regenerated | `pnpm install` locally on each branch |
| Cross-branch type dep | #13, #12 | `telegram.ts` and `api-usage.ts` import `./db-context` which only existed on PR #8's branch | Merge PR #8 first → rebase others onto new main |
| Real TS errors | #8, #9, #13 | `apps/admin` missing `@types/pg`; `client.query<T>` doesn't typecheck when client is `any`; missing comma fix flagged by strict null checks in `seed-platform-user.ts` | Repo-wide changes — see PR #8 |

Final merge order, dependency-respecting:

1. **PR #8** (db-context — unblocks everything that imports it)
2. **PR #11 + PR #14** (Sentry + pgvector — independent of #8)
3. **PR #9 + PR #12 + PR #13** (rebased onto new main after #8 lands)
4. **PR #7** (multi-tenancy SQL — applied separately, see Phase D)

Bonus repo cleanup: added `*.tsbuildinfo` to `.gitignore` (TypeScript incremental build cache was getting committed by accident on PRs #9, #12 amend cycles).

### Migrations applied to staging RDS (Phases C + D)

**Network path** — staging RDS is in fully private subnets (no NAT, no IGW). After multiple pivots, the working path was:

1. Add SSM messaging permissions to `cl-stg-admin-task-role` (4 actions: `CreateControlChannel`, `CreateDataChannel`, `OpenControlChannel`, `OpenDataChannel`).
2. Enable `enableExecuteCommand: true` on the ECS service.
3. Force-deploy + stop running task to spawn a replacement with the new property (the property is checked at task launch).
4. From CloudShell: `aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost` through the task → local port 15432 → `cl-stg-db.ccpw2uyocew0.us-east-1.rds.amazonaws.com:5432`.
5. `psql -h localhost -p 15432 -U cladmin -d continueleads` ✓

**Result**: all 5 migrations applied cleanly:

- `0003_multi_tenancy.sql` (had one bug — see Issues below)
- `0004_multi_tenancy_rls.sql`
- `0005_multi_tenancy_backfill.sql`
- `0006_api_usage.sql`
- `0007_duplicate_content.sql`

`schema_migrations` now has 7 rows. Tenant `internal` (UUID `00000000-0000-0000-0000-000000000001`, ACTIVE) seeded. RLS enabled on all expected tables. `pgvector 0.7.3` installed. Both DB roles created with correct `rolbypassrls` settings.

### Task def revision + secrets wired (Phase E)

Registered `cl-stg-admin:61` via `register-task-definition` with 5 new `secrets:` entries (Sentry × 3, Telegram × 2). Service updated to use rev 61. Rolled out cleanly.

### Smoke tests + platform user (Phase F)

- **Platform user seeded** via direct INSERT (instead of the seed CLI — cleaner from CloudShell). Used Python `bcrypt` for hashing through a heredoc to dodge bash `!` history-expansion on the password. Verified with `bcrypt.checkpw` → MATCH.
- **/api/health** → `{status: "healthy", db: "ok", dbLatencyMs: 83}` ✓
- **Telegram bot** → `{ok: true, message_id: 5}` + message arrived on phone ✓
- **POST /api/platform-auth/login** → `HTTP/2 200` + `Set-Cookie: cl_session=…; Domain=.continueleads.com; Secure; HttpOnly; SameSite=strict; Expires=12h` + body `{ok: true, user: {…}}` ✓

This single response validates end-to-end: bcryptjs in Node accepts Python's `$2b$12$` hash, `withPlatformContext` works, sessions table works, cookie config is correct, middleware passes through `isAlwaysPublic`, ALB routes by host, all 8 env vars loaded.

### Issues surfaced (and fixed)

**1. Malformed secret JSON.** When manually editing `cl-stg-app-secrets` in the Console "Plaintext" editor, missed the comma between `PII_ENCRYPTION_KEY` and the new `SENTRY_DSN` line. Console's "Errors: 0" validator was too lenient and accepted invalid JSON. Caused 48 task launch failures with `ResourceInitializationError: unable to retrieve secret from asm: invalid character '"' after object key:value pair`. Fixed via `sed` + `put-secret-value`. **Mitigation**: in future, validate secret JSON with `jq` BEFORE saving in Console.

**2. Middleware bug — `apex/unknown` redirect runs before `isAlwaysPublic`.** When ALB health-checks the task on `/login` with `Host: <task-IP>`, `parseSubdomain` returns `type: 'unknown'` → middleware 307-redirects to `admin.continueleads.com/login`. ALB matcher was set to strict 200 → unhealthy → 48 failed launches stacked up. **Workaround applied**: widened ALB matcher to `200-307`. **Proper fix (deferred)**: move `isAlwaysPublic(pathname)` check above the `apex`/`unknown` redirects in `middleware.ts`. Task added.

**3. `0003_multi_tenancy.sql` line 102 — partial index on `now()`.** PG rejects non-IMMUTABLE functions in index predicates. Fixed in [PR #15](https://github.com/davincidevllc/continue-leads/pull/15) (merged today): dropped the `WHERE expires_at > now()` clause; now a full index. CloudShell `/tmp` copy patched via `sed` for immediate re-apply.

### Followups created

- **Middleware fix** — move `isAlwaysPublic` above apex/unknown redirects. Once landed, ALB matcher can return to strict 200.
- **APP_VERSION env var** — `/api/health` returns `version: "unknown"` because the task def has no `APP_VERSION`. CI should stamp it with git SHA on image build.
- **MT-3b** — `tenant_id NOT NULL` flip. Still deferred until MT-8.
- **Dual migration system consolidation** — still on the list.
- **GitHub PAT cleanup** — Thiago to delete `cl-cloudshell-migrate` token at end-of-day.
- **Password rotation** — `Filhodaputa12!!!` was used in chat; rotate to iCloud Keychain–only.

### Where we are end-of-day

- Burst 0a — secrets migration ✓ (done 2026-06-12)
- Burst 0b.1 — multi-tenancy SQL ✓ (applied today)
- Burst 0b.2 — auth + routing ✓ (deployed today; login works end-to-end)
- Burst 0d — Telegram sender library shipped ✓ (verified live)
- Burst 0e — Sentry + /api/health ✓ (health verified; Sentry awaits an actual error to fire)
- Burst 0f — Cost-tracking schema + Claude wrapper ✓
- DCD-1 — pgvector schema ✓

**Next session: Burst 0b.3 — MT-8 (API route refactor) + MT-9 (tenant mgmt UI) + MT-10 (tenant user invitations).** This is the "stop using `cladmin` for app queries; switch to `app_tenant_user` / `app_platform_user` via withTenantContext/withPlatformContext" pass.

---

**Previous session: 2026-06-13 — Burst 0b.1 + 0b.2 + 0d (TG-2) + 0e (MON-1/2) + 0f (COST-1/2) + DCD-1 written. 8 PRs queued for in-person apply session.**

What was completed:

### Tooling & cleanup
- **`gh` CLI installed** locally via official `.pkg` (v2.94.0, Apple Silicon Mac), `gh auth login` complete, token in macOS Keychain. All PRs in this session opened via `gh pr create`.
- **Stale remote branches deleted** — only `origin/main` plus the three new active feature branches remain.
- **PR #6 merged** — `docs: rename boston-co → localize`. All 6 docs (CLAUDE.md + 5 spec files) updated.

### Burst 0b.1 — SQL written (PR #7, open)

Branch `feat/burst-0b1-multi-tenancy`. Three migrations in `packages/db/migrations/`:

- `0003_multi_tenancy.sql` — MT-1 schema (306 lines): 6 new tables (`tenants`, `platform_users`, `tenant_users`, `sessions`, `tenant_audit_log`, `platform_audit_log`) + nullable `tenant_id` column added to ~26 existing tenant-scoped tables across both migration systems (canonical + legacy).
- `0004_multi_tenancy_rls.sql` — MT-2 RLS: creates `app_tenant_user` (RLS-subject) and `app_platform_user` (BYPASSRLS) DB roles + privileges; enables RLS on 29 tables; writes per-table policies filtering by `current_setting('app.current_tenant_id', true)::uuid`.
- `0005_multi_tenancy_backfill.sql` — MT-3a backfill: deletes the E2E test brand, seeds the `internal` tenant with fixed UUID `00000000-0000-0000-0000-000000000001`, backfills `tenant_id` on every remaining row. Sanity DO block raises on unexpected state.

### Burst 0b.2 code written (PR #8 + PR #9, open)

- **PR #8** — Branch `feat/burst-0b2-mt4-db-context`. MT-4 db-context wrapper at `apps/admin/src/lib/db-context.ts` (177 lines). Exports `withTenantContext`, `withPlatformContext`, `resolveTenantBySlug`. Uses `SET LOCAL ROLE` + parameterized `set_config('app.current_tenant_id', $1, true)` for safe RLS scoping. UUID validation at the boundary.
- **PR #9** — Branch `feat/burst-0b2-auth`. MT-5 (middleware), MT-6 (platform auth), MT-7 (tenant auth) — 9 files, +705/-18:
  - `apps/admin/src/middleware.ts` rewritten: parses host, sets `x-cl-subdomain-type` / `x-cl-subdomain-slug` headers, handles apex/unknown/admin/tenant cases. Preserves legacy HMAC cookie path for backwards compat.
  - `apps/admin/src/lib/session.ts` (new) — DB-backed session create/load/delete, cookie config (12h, HttpOnly, Secure in prod, SameSite=Strict, scoped to `.continueleads.com`). Random 32-byte tokens; SHA-256 hash stored in DB.
  - `app/api/platform-auth/login/route.ts` + `logout/route.ts` — bcrypt verify against `platform_users`, session creation, anti-enumeration constant-time check.
  - `app/api/tenant-auth/login/route.ts` + `logout/route.ts` — same shape, resolves slug → tenant → user, queries `tenant_users`.
  - `packages/db/src/seed-platform-user.ts` — CLI script to create/rotate Thiago's first platform user, wired as `pnpm --filter @continue-leads/db seed:platform-user <email> <password> [name]`.
  - `bcryptjs` added to both `apps/admin` and `packages/db` package.json. Pure JS, no native compile.

### CLAUDE.md updates (this PR)

- Architectural decisions added: canonical migration system, internal tenant seed UUID.
- New Known Issue: dual migration systems (`packages/db/migrations/` + `/migrations/`) — both live on staging; new work goes in canonical, legacy directory marked for future consolidation.
- This Last Session block.

Architectural decisions surfaced this session:

- **Canonical migration system** = `packages/db/migrations/` (added to Decisions Log).
- **Internal tenant seed UUID** = `00000000-0000-0000-0000-000000000001` (Decisions Log).
- **MT-3 split into MT-3a (data backfill, ships now) + MT-3b (NOT NULL flip, deferred).** NOT NULL cannot land until MT-8 refactors API routes to provide `tenant_id` on every INSERT. MT-3b is task #19.
- **bcryptjs over native bcrypt** — pure JS, no native compile issues on ECS Fargate.
- **Random opaque session tokens, not JWT** — database is the source of truth; deletion = instant revocation.
- **Session cookie scoped to `.continueleads.com`** — one cookie persists across admin + tenant subdomains; the SESSION ROW maps to a specific user/tenant.
- **Legacy HMAC auth preserved in middleware** until MT-8 refactors existing routes en masse. PR #9 is additive; nothing was deleted.

### Burst 0e — Monitoring (PR #11)

Branch `feat/burst-0e-monitoring`. 8 files, +245/-2:
- **MON-1 Sentry SDK** — `@sentry/nextjs` integration with three runtime configs (`sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`) plus `apps/admin/src/instrumentation.ts` hook. `next.config.js` conditionally wraps with `withSentryConfig` only when `SENTRY_DSN` is set, so this is safe to ship before signup.
- **MON-2 Health endpoint** — `GET /api/health` returns `{status, version, region, db, dbLatencyMs, responseTimeMs, timestamp}` with a 1s DB-check timeout and proper Cache-Control. Auth bypass added to both legacy middleware AND PR #9's new middleware (small forward-compat commit pushed to PR #9 to avoid merge conflicts).

### Burst 0f — Cost tracking (PR #12)

Branch `feat/burst-0f-cost-tracking`. 5 files, +353:
- **COST-1 `api_usage` table** — `packages/db/migrations/0006_api_usage.sql`. Tenant-scoped, RLS, 3 indexes (tenant×time for the dashboard, brand×time for attribution, provider×model×time for the platform-admin rollup). Tracks both successful and failed API calls.
- **COST-2 Claude wrapper** — `apps/admin/src/lib/anthropic.ts` exports `generateMessage()` as the single entry point for Claude API calls. Auto-tracks usage to `api_usage` (best-effort, never breaks the call). Adds `@anthropic-ai/sdk` dep. Per-model pricing table in `anthropic-pricing.ts` flagged as "verify before use." Generic `recordApiUsage` helper in `api-usage.ts` will be reused for Voyage / Flux wrappers.

### Burst 0d — Telegram sender (PR #13)

Branch `feat/burst-0d-tg-sender`. Single file `apps/admin/src/lib/telegram.ts`, +300, no new deps (Node 20+ fetch):
- **TG-2 sendAlert library** — `sendAlert({tenantId?, level, eventType, title, body?, metadata?})` is the single entry point. Resolves chat ID (per-tenant `tenants.settings.alerts.telegram_chat_id` OR platform `TELEGRAM_PLATFORM_CHAT_ID`). 13-event taxonomy. Per-event-type in-memory rate limiting (per ECS task). HTML message formatting with per-level emojis. **NEVER throws** — failure modes returned in result, never bubble up to caller. `sendTestAlert()` trip-wire helper for verifying wiring after deploy.

### DCD-1 — Duplicate-content schema (PR #14)

Branch `feat/burst-0p-dcd-schema`. Single migration `0007_duplicate_content.sql`, +137:
- `CREATE EXTENSION vector` (pgvector ships with RDS PG 16)
- `page_embeddings` — 1024-dim `vector` column matching Voyage `voyage-3-lite`, HNSW index for sub-50ms nearest-neighbor with cosine distance, `content_version` preserved per refresh cycle
- `similarity_alerts` — flagged page-pairs with canonical pair ordering (`CHECK page_a_id < page_b_id`)
- `similarity_trend_snapshots` — daily per-brand stats for the trend chart, idempotent per `UNIQUE(tenant_id, site_id, snapshot_date)`
- All RLS-protected; unblocks DCD-2 (Voyage wrapper) and DCD-3+ later

What's in progress:

- **8 PRs open, all conceptually finished but awaiting in-person apply + verify:**
  - **PR #7** — `feat/burst-0b1-multi-tenancy` — SQL migrations 0003/0004/0005 (Burst 0b.1)
  - **PR #8** — `feat/burst-0b2-mt4-db-context` — `db-context.ts` (MT-4)
  - **PR #9** — `feat/burst-0b2-auth` — middleware + auth routes + seed script (MT-5/6/7)
  - **PR #11** — `feat/burst-0e-monitoring` — Sentry SDK + `/api/health` (MON-1/2)
  - **PR #12** — `feat/burst-0f-cost-tracking` — `api_usage` table + Claude wrapper (COST-1/2)
  - **PR #13** — `feat/burst-0d-tg-sender` — Telegram sender library (TG-2)
  - **PR #14** — `feat/burst-0p-dcd-schema` — pgvector + duplicate-content schema (DCD-1)
- **This CLAUDE.md closeout PR (#10)** — branch `docs/burst-0b1-0b2-session-closeout`.

**Total session output: ~3,500 lines across 8 PRs.**

### Apply order (next session, in-person)

Strictly in this order — multi-tenancy migrations MUST apply before everything else because every later migration / code path depends on the `tenants` table + RLS roles:

1. **Pull main and check out PR #7's branch** for the apply: `git fetch && git checkout feat/burst-0b1-multi-tenancy`.
2. **Apply 0003/0004/0005 to staging RDS** via `pnpm db:migrate:staging` (or psql / CloudShell fallbacks).
3. **Verify**: `\d+ sites` shows `tenant_id` + RLS policy; `SELECT slug FROM tenants;` returns `internal`; `schema_migrations` has the three new versions; test brand deleted.
4. **Confirm existing app still works** (legacy HMAC path preserved — no observable change yet).
5. **Merge PR #7.**
6. **Merge PR #8** (MT-4 db-context).
7. **Merge PR #9** (Burst 0b.2 auth + routing) — `pnpm install` for bcryptjs before deploy.
8. **Seed Thiago's platform user:** `pnpm --filter @continue-leads/db seed:platform-user thiago@continueleads.com '<strong password>' 'Thiago DeSouza'`. Store password in iCloud Keychain (`CL — Platform Login`).
9. **Deploy** — push to main triggers CI → ECS.
10. **Smoke test platform login** at `https://admin.continueleads.com/api/platform-auth/login` — verify cookie + session row.
11. **Checkout PR #11's branch, apply nothing (code-only)**, merge. `pnpm install` for `@sentry/nextjs`. Deploy.
12. **Smoke test `/api/health`** — returns 200 with `db: 'ok'` (works immediately; bypasses auth).
13. **Sign up at sentry.io** (free tier), get DSN, add to `cl-stg-app-secrets`: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT=staging`. Update ECS task def. Force-redeploy. Verify with intentional throw.
14. **Apply 0006_api_usage.sql** (PR #12). Merge PR #12. `pnpm install` for `@anthropic-ai/sdk`. Verify `\d+ api_usage` shows the columns + RLS policy.
15. **Talk to @BotFather**, create the Continue Leads bot, copy token. Send any message from your personal Telegram, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` for your chat ID. Add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_PLATFORM_CHAT_ID` to `cl-stg-app-secrets`. Merge PR #13. Verify by calling `sendTestAlert()`.
16. **Apply 0007_duplicate_content.sql** (PR #14) — verify `\dx vector` shows the extension. Merge PR #14.
17. **Update ALB target group health check path** from `/` to `/api/health` (AWS Console).
18. **Merge PR #10 (this closeout).**

Once all 8 PRs are merged + applied:
- **All of Burst 0b is live** (multi-tenancy enforced via RLS, new auth path working).
- **Burst 0d/0e/0f foundations are live** — Telegram channel works, Sentry catches errors, cost tracking ready for Phase 3, duplicate detection schema ready for Phase 4.

Then start **Burst 0b.3** (MT-8 API route refactor, MT-9 tenant management UI, MT-10 tenant user invitation).

### What's NOT applied yet

- Wildcard ACM cert `*.continueleads.com` (needed before tenant subdomains actually resolve) — defer to before Burst 0b.3 demo.
- `tenant_id` `NOT NULL` flip — task #19, after MT-8.
- Legacy HMAC auth removal — also after MT-8.
- Dual-migration system consolidation — Known Issue for later.

Open questions / blockers (carried over):

- Telegram personal account vs dedicated CL bot account (Burst 0d).
- Joe / Isis Telegram cadence (Burst 0d).
- LeadSquad provisioning order (Burst 0b.3).
- First-tenant demo seed data — sample brands in DRAFT for the dashboard (Burst 0c)?
- TCPA copy still placeholder, blocked on attorney review (Phase 2).
- Wildcard ACM cert `*.continueleads.com` needed before MT-5 (deferred to Burst 0b.2 prep).

---

*Update the Last Session block at the bottom of this file before stopping each day.*
