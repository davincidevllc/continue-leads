# Continue Leads — Claude Code Context

> **Read this file in full before doing anything else.**
> Last updated: 2026-06-12

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

- **`cl-stg-db-credentials` Secrets Manager entry is incomplete** — it has `host`, `port`, `dbname`, `username` but no `password`. The app reads `DB_PASSWORD` from `cl-stg-app-secrets` instead. Either (a) sync the current password into this secret so it's a complete connection record, or (b) delete this orphan secret entirely. Future improvement: refactor the app to read all four DB connection values from one secret instead of mixing env + secret. Low priority.
- **Session cookie still `secure: false`** in `apps/admin/src/lib/auth.ts:39`. Legacy from HTTP-era staging. Now that HTTPS is enforced (Phase 1 closed 2026-05-04), flip to `secure: true` so the cookie won't transmit over plain HTTP. Small one-file PR. Will be folded into Phase 0 RBAC-2 if not done sooner.
- **Session cookie `SameSite=lax`** — Phase 0 RBAC-2 should bump to `SameSite=strict` for the admin app (no cross-site embeds expected).
- **Cruft directories** at repo root from past botched shell commands: `apps/for/`, `dir/`, `its/`, `{apps/`. Each contains files literally named `placeholder` and `cat > `. Clean up in a dedicated tidy commit when not mid-feature.
- **`cap_config.max_pages`** default of 500 may be wrong per missing Wave 1 Addendum.
- **Bootstrap vs Tailwind in admin UI** — README says Bootstrap, Master Plan implies Tailwind. Verify which is in `apps/admin/` before any UI build task.
- **Empty/malformed POSTs return HTTP 500** on `/api/auth/login` and `/api/leads/capture` — should return 400. Pre-existing, unrelated to recent changes. Hardening task.
- **No `DELETE /api/brands/[id]` endpoint** — `DELETE /api/brands/[id]/pages` exists, but no way to delete a brand record itself via HTTP. Test brand `cl-e2e-painting-ma-20260503.com` (id `68adfd7a-42b4-48e8-9be0-b338cdcbbaa9`) is sitting in staging as a test artifact. Add endpoint when convenient.
- **Dead validation CNAME at name.com** — during Phase 1 DNS work, an ACM validation CNAME was added at name.com before discovering DNS is at Cloudflare. The record at name.com is inert (nameservers point to Cloudflare). Delete on next visit to name.com DNS panel.
- **`gh` CLI not installed locally** — every PR creation requires the user to open the compare URL in a browser. ~30s per PR, but adds friction. Install via manual download (no `brew` on this machine) when there's spare time, then `gh auth login`. Token stored in macOS Keychain.

## Last Session

**Session: 2026-06-12 — Burst 0a (Secrets migration) complete**

What was completed:

- **All three plaintext secrets migrated to AWS Secrets Manager:** `ADMIN_AUTH_SECRET`, `DB_PASSWORD`, `PII_ENCRYPTION_KEY` now live as JSON keys under `cl-stg-app-secrets`. ECS task def revision **53** (was on 52 — CLAUDE.md said 51, slight drift) references them via `secrets:` block; the three values are removed from `environment:`.
- **All three values rotated during migration.** Old values (`ContinueLeads2026Staging` for ADMIN_AUTH_SECRET, `BasilioDeSouza12!` for DB_PASSWORD, unknown for PII_ENCRYPTION_KEY since not yet used) treated as compromised. New values generated via `openssl rand`, stored in iCloud Keychain under `CL — Staging *` entries per session-protocol.md.
- **RDS master password updated** to match the new `DB_PASSWORD` value. Self-managed (not RDS-managed credentials — confirmed via the absence of "Managed in Secrets Manager" label on the RDS instance page).
- **IAM execution role** `cl-stg-admin-exec-role` already had a customer-inline policy `secrets-access` granting `secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:us-east-1:768499314735:secret:cl-stg-app-secrets-pUvqDq` — no policy edit needed.
- **Force-deployed ECS service** to revision 53. New task came up healthy in ~2 minutes. Old task drained. Login verified at `https://admin.continueleads.com` with new `ADMIN_AUTH_SECRET`. Dashboard rendered DB-backed data (Sites: 4, Active Metros: 5) proving the new `DB_PASSWORD` reaches the app and RDS accepts it.
- **Known Issues entry "CRITICAL: All secrets are plaintext" removed** from this file. Replaced with smaller cleanup item about `cl-stg-db-credentials` being incomplete (no password key) — low priority.
- **Decisions Log entry added** documenting the staging secrets layout.

Architectural decisions confirmed (no new ones — execution of existing plan):

- Per-secret JSON key reference syntax (`arn:...:cl-stg-app-secrets-XXX:KEY::`) works cleanly; ECS task def stays readable.
- Brief deploy-window outage (~1-3 min between RDS password change and new task being healthy) is acceptable for staging. For prod-tier rollouts we'd want a slower rolling deploy with RDS-managed credentials.

What's in progress:

- Nothing. Working tree clean on `main` (with this closeout PR pending merge).

Next task (when Thiago resumes):

- **Burst 0b.1 — Multi-tenancy schema + isolation** (~3 hours). MT-1 (schema migration), MT-2 (DB roles + RLS), MT-3 (backfill + NOT NULL). Spec: `docs/multi-tenancy-spec.md`. Plan: `docs/phase-0-plan.md`.
- Open the session with `docs/session-protocol.md` 60-second opener.

Open questions / blockers (carried over):

- Telegram personal account vs dedicated CL bot account (Burst 0d).
- Joe / Isis Telegram cadence (Burst 0d).
- LeadSquad provisioning order (Burst 0b.3).
- First-tenant demo seed data — sample brands in DRAFT for the dashboard (Burst 0c)?
- TCPA copy still placeholder, blocked on attorney review (Phase 2).

---

*Update the Last Session block at the bottom of this file before stopping each day.*
