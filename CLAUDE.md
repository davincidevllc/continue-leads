# Continue Leads — Claude Code Context

> **Read this file in full before doing anything else.**
> Last updated: 2026-05-05

## Project

Lead generation platform. Programmatically generates local SEO landing pages
(money pages = city × service combos) for service businesses. Each page gets a
unique AI-generated body. Leads captured through embedded forms are sold via a
real-time ping-post auction to aggregators and direct buyers.

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
Plan: see `docs/phase-0-plan.md` (13 atomic tasks, 4 streams, ~6 bursts of 1-3h each).
Critical path: RBAC-1 → RBAC-2 → RBAC-4. Telegram, Sentry, health endpoint can parallelize.
1. RBAC — replace single shared password with users + roles (Admin/Ops/Sales/Dev), per-route gates, audit log. Bring permissions matrix to review before building.
2. Telegram bot (AWS Lambda) — proactive alerts to a team Telegram group + inbound queries from Thiago. **Not WhatsApp.**
3. Cost visibility dashboard — show estimated Claude API cost before every content batch; require typed confirmation when cost > $0 (i.e., always, for now).
4. Monitoring — CloudWatch alarms for ECS/RDS/queue depth + Sentry free tier for application exceptions.

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

- Brand logos: provided by Gerry per brand → `/assets/brands/[brand-id]/`.
- Page images: AI-generated, provided by Gerry per vertical → `/assets/[vertical]/`.
- All assets via CloudFront, WebP, max 200KB, responsive srcset auto-generated.

## Team

- **Thiago** — founder, technical lead. Working with you (Claude Code). Role: Admin.
- **Gerry** — UI/UX (Figma, Philippines). Delivers designs, brand logos, AI-generated images.
- **Joe** — sales/BD. Role: Sales (read-only leads + revenue dashboard).
- **Isis** — ops director candidate. Role: Ops (QA review, lead management, brand status).
- **2 full-stack devs** (Philippines, via Outsourcey). Role: Dev.

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

- **Session cookie still `secure: false`** in `apps/admin/src/lib/auth.ts:39`. Legacy from HTTP-era staging. Now that HTTPS is enforced (Phase 1 closed 2026-05-04), flip to `secure: true` so the cookie won't transmit over plain HTTP. Small one-file PR. Will be folded into Phase 0 RBAC-2 if not done sooner.
- **Cruft directories** at repo root from past botched shell commands: `apps/for/`, `dir/`, `its/`, `{apps/`. Each contains files literally named `placeholder` and `cat > `. Clean up in a dedicated tidy commit when not mid-feature.
- **`cap_config.max_pages`** default of 500 may be wrong per missing Wave 1 Addendum.
- **Bootstrap vs Tailwind in admin UI** — README says Bootstrap, Master Plan implies Tailwind. Verify which is in `apps/admin/` before any UI build task.
- **Empty/malformed POSTs return HTTP 500** on `/api/auth/login` and `/api/leads/capture` — should return 400. Pre-existing, unrelated to recent changes. Hardening task.
- **No `DELETE /api/brands/[id]` endpoint** — `DELETE /api/brands/[id]/pages` exists, but no way to delete a brand record itself via HTTP. Test brand `cl-e2e-painting-ma-20260503.com` (id `68adfd7a-42b4-48e8-9be0-b338cdcbbaa9`) is sitting in staging as a test artifact. Add endpoint when convenient.
- **Dead validation CNAME at name.com** — during Phase 1 DNS work, an ACM validation CNAME was added at name.com before discovering DNS is at Cloudflare. The record at name.com is inert (nameservers point to Cloudflare). Delete on next visit to name.com DNS panel.
- **`gh` CLI not installed locally** — every PR creation requires the user to open the compare URL in a browser. ~30s per PR, but adds friction. Install via manual download (no `brew` on this machine) when there's spare time, then `gh auth login`. Token stored in macOS Keychain.

## Last Session

**Session: 2026-05-04 → 2026-05-05 — Phase 1 closeout + Phase 0 plan**

What was completed:

- **PR #2 merged** (auth bypass tightened — only `/login`, `/api/auth/*`, `/api/leads/capture` are public; the rest of `/api/*` requires `cl_admin_session` cookie). Verified post-deploy via `curl` returning 307 → `/login` for `/api/brands`, `/api/admin`, etc.
- **PR #3 merged** (CLAUDE.md fact corrections — removed false "cities.population not seeded" claim, removed resolved auth bypass from Known Issues, added two new tracked issues).
- **Phase 1 Step D — DNS + HTTPS — complete.** End-to-end:
  - ACM cert requested in `us-east-1` for `admin.continueleads.com`. ARN: `arn:aws:acm:us-east-1:768499314735:certificate/02c537e1-a125-474a-81ef-01776aca0f76`. DNS-validated. Issued, valid through 2026-11-17, auto-renews.
  - **Discovered:** `continueleads.com` DNS is at Cloudflare, not Route 53. Initial CNAME placed at name.com was inert (nameservers point to Cloudflare). Re-added at Cloudflare with proxy OFF (gray cloud — required for ACM validation and direct ALB connections).
  - HTTPS:443 listener added to `cl-stg-admin-alb` with the ACM cert and `ELBSecurityPolicy-TLS13-1-2-2021-06`.
  - ALB security group `cl-stg-alb-sg` updated: inbound 443 from `0.0.0.0/0` and `::/0`.
  - HTTP:80 listener changed from "Forward to target group" → "Redirect to URL" (HTTPS:443, HTTP_301, URI parts preserved).
  - `admin` CNAME at Cloudflare → ALB hostname (DNS only, gray cloud).
  - Verified: `curl -I https://admin.continueleads.com/login` returns HTTP/2 200, cert validates without `-k`, HTTP redirects to HTTPS.
- **Phase 0 plan drafted** — `docs/phase-0-plan.md` (255 lines) on branch `docs/phase-0-plan`. Breaks Phase 0 into 13 atomic tasks across 4 streams (RBAC, Telegram, Cost dashboard, Monitoring). Includes dependency graph, recommended 6-burst sequence, exit criteria, decisions to confirm, risks/mitigations, and out-of-scope list.
- **Git identity fixed** globally on this machine: `Thiago DeSouza <thiago@continueleads.com>`. Past merged commits with `@Thiagos-MacBook-Pro-2.local` left untouched (history rewrite not worth it).

What's in progress:

- Branch `docs/phase-0-plan` committed but not yet pushed. PR to be opened for Thiago review (no merge required to start work — plan is reference, not gate).

Next task:

- Open Phase 0 plan PR for review.
- After review, pick first burst from the plan: **RBAC-1 (users + sessions + audit_log schema)**, ~45 min. Schema-only, sets up everything downstream.

Open questions / blockers:

- Phase 0 plan has 4 explicit "Decisions to confirm" (bcrypt vs argon2id, session token strategy, Telegram channel structure, cost alert thresholds, Sentry vs alt, first admin email). Answer in plan-doc PR review or first burst.
- Long-tail: TCPA copy, launch scope (1 vertical or 3), Wave 1 Addendum location, dead CNAME cleanup at name.com, `gh` CLI install.

---

*Update the Last Session block at the bottom of this file before stopping each day.*
