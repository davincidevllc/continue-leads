# Continue Leads — Claude Code Context

> **Read this file in full before doing anything else.**
> Last updated: 2026-05-05

## Project

**Continue Leads is a multi-tenant SaaS platform** for programmatic local-SEO lead generation. Each tenant (customer company) operates their own set of "brands" — lead-gen-front websites that capture homeowners' contact info via city × service combination "money pages." Each page gets a unique AI-generated body. Leads are captured through embedded forms and sold via a real-time ping-post auction to contractors and aggregators.

**Current tenants (planned):**
- `internal` — Continue Leads' own ops / R&D
- `leadsquad` — Tampa partners running their own lead-gen
- `boston-co` — Joe + Isis's Boston operation (name TBD)

Thiago (you) is a platform owner and also a partner at LeadSquad + Boston Co. The platform is designed so YOU can walk away from any partnership and the platform travels with you.

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
| **Platform model** | Multi-tenant SaaS; LeadSquad + Boston Co + future are tenants | 2026-05-XX — fundamental architecture pivot from single-tenant assumptions |
| **Tenant code term** | `tenant` (not `account`, not `company`) | 2026-05-XX — chosen to avoid collisions with "account" and "company" elsewhere |
| **Isolation strategy** | Postgres Row-Level Security (RLS) + tenant-scoped DB roles | DB enforces; app code can't accidentally leak cross-tenant data |
| **URL structure** | `admin.continueleads.com` for platform admin, `{slug}.continueleads.com` per tenant | Wildcard ACM cert needed |
| **Session expiration** | 12 hours, uniform for platform and tenant users | Will lift to 7d for tenant + 2FA-gated 7d for platform when 2FA lands |
| **Tenant lifecycle** | Two states: ACTIVE, DELETED. DELETED blocks tenant-user login but everything else keeps running; platform admin retains full access | Manual SQL only for hard delete |
| **Image generation** | Flux schnell via API; each tenant brings their own API key | DALL-E 3 considered for future quality upgrade |
| **Image pool ownership** | Per-tenant per-vertical (v1); per-brand (v2 when brand is spun up) | No cross-tenant image sharing — every tenant pays for and owns their own imagery |
| **Image approver** | Per-tenant assigned user: LeadSquad = one of their partners, Boston Co = Gerry, default = tenant Admin | Sample review of 10% per batch |
| **Five-star display** | Decorative stars with framing like "Quality Service Guaranteed" — no rating-count claim | FTC-defensible posture; deferred reviews collection to v2 |
| **TCPA consent UX** | "By clicking" implied consent (no checkbox) above submit button | Stronger legal posture than checkbox |
| **Duplicate detection** | Voyage `voyage-3-lite` embeddings + pgvector; 0.85 block / 0.75 warn thresholds | Per-tenant tunable; cross-tenant comparison explicitly OFF |
| **Off-page SEO** | Out of scope for v1 (brands are lead-gen fronts, not real businesses) | Revisit when we have enterprise tenant wanting branded sites |
| **Blog content source** | AI-only initially; per-brand toggle (AI / hybrid / human) added in future | Cadence: 2-4 posts/week per brand |
| **Domain ownership** | Thiago personally owns all brand domains by default (sticky leverage); tenant can opt to own their own | Transferable later via platform admin action |
| **Email forwarding for brand domains** | ImprovMX catch-all v1; AWS SES + Lambda parser for v2 (email-as-lead) | Free tier covers first 25 domains |
| **Embedding storage** | pgvector inside existing RDS — no separate vector DB | Zero infra cost |
| **Approval workflow** | Auto-generation + required tenant-level approval before images go usable | Per-tenant approver |

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

- **Thiago** — founder, platform owner, technical lead. Working with you (Claude Code). Platform User (super-admin across all tenants). Also partner at LeadSquad + Boston Co.

### Tenants and tenant users

- **`internal` tenant** — Continue Leads' own ops. Thiago is the only user.
- **`leadsquad` tenant** — Tampa partners (names TBD). The LeadSquad partners run lead-gen via the platform; one of them is the assigned image approver for that tenant.
- **`boston-co` tenant** (name TBD until Joe + Isis decide):
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

- **CRITICAL: All secrets are plaintext in the ECS task definition** (discovered 2026-05-05 while debugging staging login). The task def `cl-stg-admin:51` has `ADMIN_AUTH_SECRET`, `DB_PASSWORD`, `PII_ENCRYPTION_KEY` in the plain `environment` block — anyone with ECS read access sees them. The `cl-stg-app-secrets` Secrets Manager entry exists with `adminAuthSecret`/`kmsKeyId` keys, but the running app never reads it (no `secrets` block in the task def). Phase 0 must include a "secrets migration" task: register a new task def revision that uses `secrets:` references for all sensitive vars and remove them from `environment:`. The current ADMIN_AUTH_SECRET value is `ContinueLeads2026Staging` (not the `BasilioDeSouza12!` shown in Secrets Manager — that's actually the DB password). Treat both as compromised once we migrate; rotate at the same time.
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

**Session: 2026-05-XX — Platform architecture v2 (multi-tenant pivot)**

What was completed:

- **Five new spec docs written**, all on branch `docs/platform-architecture-specs`:
  - `docs/multi-tenancy-spec.md` (~440 lines): tenant model, RLS isolation, two-state lifecycle (ACTIVE / DELETED), URL strategy (`{slug}.continueleads.com`), wildcard ACM cert plan, platform vs tenant users, impersonation flow, 11 atomic implementation tasks (MT-1 through MT-11), migration path from single-tenant
  - `docs/duplicate-content-detection.md` (~330 lines): Voyage `voyage-3-lite` embeddings, pgvector storage, 0.85/0.75 thresholds, six dashboard views (heatmap, within-brand grid, alert queue, page-pair compare, trend chart), QA Agent integration, 10 atomic tasks
  - `docs/image-strategy.md` (~410 lines): Flux schnell provider, per-tenant pools (200 images), tenant brings own API key, per-tenant approval workflow, anti-clustering rules, v2 per-brand roadmap, 9 atomic tasks
  - `docs/seo-aeo-strategy.md` (~600 lines): 36 mandatory per-page elements, sitewide elements, 8 content layers, blog system (NEW from Master Plan), internal linking architecture, schema library, trust signal kit, TCPA copy draft, 24 atomic tasks
  - `docs/session-protocol.md` (~280 lines): 60-second session opener, master "where things live" map, iCloud Keychain organization, common gotchas runbook, end-of-session wrap-up protocol
- **Phase 0 plan rewritten** (`docs/phase-0-plan.md` on this branch, supersedes the version on `docs/phase-0-plan`): 7 streams across 7-9 bursts, ~22-30 hours total. Multi-tenancy replaces RBAC stream entirely.
- **CLAUDE.md substantially updated**: project description now multi-tenant; 18 new Decisions Log entries; Team section restructured to platform / tenant / contractor levels; Phase 0 priorities replaced; references to all five new spec docs in the header.

Architectural decisions locked during this session:

- **Continue Leads is a platform**, not a single business. LeadSquad (Tampa) and Boston Co (Joe + Isis) are tenants. Designed so Thiago can walk away from any partnership.
- **Tenant isolation via Postgres RLS** — DB enforces, app code can't accidentally leak.
- **Subdomain per tenant** — `{slug}.continueleads.com`. Wildcard ACM cert required.
- **One-bot Telegram with per-tenant routing** (chat ID per tenant in `tenants.settings`).
- **Per-tenant image generation** — each tenant brings their own Flux API key; pools are tenant-scoped, never shared.
- **Per-tenant approver workflow** — LeadSquad: a partner; Boston Co: Gerry; default: tenant Admin.
- **Trust signals**: 5-star decorative with "Quality Service Guaranteed" framing (FTC-defensible); background-checked badge (true via buyer vetting); no fake reviews.
- **TCPA via implied consent** ("By clicking" language) above submit button, no checkbox.
- **Off-page SEO out of scope** for v1 (brands are lead-gen fronts, not real businesses).
- **Duplicate detection cross-tenant comparison is OFF** by design (isolation guarantee).
- **Blog system added** to SEO scope (was missing from Master Plan): 2-4 posts/week per brand, AI-only initially, tenant-configurable later.
- **Domain ownership stays with Thiago** by default (sticky leverage); tenants can opt to own their own.

What's in progress:

- Branch `docs/platform-architecture-specs` ready to commit and open PR. Five new docs + Phase 0 plan revision + CLAUDE.md updates.
- Old branches superseded by this PR: `docs/phase-0-plan` (Phase 0 plan now rewritten) and `docs/claude-md-phase-1-closeout` (CLAUDE.md updates merged into this branch). Both should be closed when this PR lands.

Next task (when Thiago resumes):

- Review the five spec docs (start with `multi-tenancy-spec.md` — it's foundational, others reference it)
- Merge this PR
- Start **Burst 0a — Secrets migration** (2-3 hours). See `docs/phase-0-plan.md` for SEC-1, SEC-2, SEC-3.
- The next session opener should follow `docs/session-protocol.md`.

Open questions / blockers (now in Phase 0 plan):

- Telegram personal account vs dedicated CL bot account
- Joe / Isis Telegram cadence (Boston Co alerts from day 1?)
- LeadSquad provisioning order (before or after Boston Co?)
- First-tenant demo seed data (sample brands in DRAFT for the dashboard?)
- TCPA copy still placeholder, blocked on attorney review

---

*Update the Last Session block at the bottom of this file before stopping each day.*
