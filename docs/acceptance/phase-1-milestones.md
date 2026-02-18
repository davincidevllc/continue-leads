# Phase 1 Milestone Acceptance Checklist

## Milestone 1 — AWS + Repo + Full Schema Deployed

### Pass Criteria
- [ ] AWS account ready with MFA on root and IAM admin user
- [ ] Staging and production environments exist (tagged resources)
- [ ] RDS Postgres (staging) reachable from services network
- [ ] Extensions confirmed: pgcrypto, btree_gist
- [ ] ECS Fargate cluster/service scaffold exists
- [ ] S3 bucket(s) created for static site hosting (staging)
- [ ] Route 53 hosted zone(s) created for purchased domains
- [ ] KMS key created for PII encryption (staging)
- [ ] CloudWatch log groups exist
- [ ] GitHub repo exists with branch protection
- [ ] GitHub Actions pipeline runs on push (lint/test/build)
- [ ] pnpm workspace installs cleanly
- [ ] TypeScript strict config in place
- [ ] Vitest runs (with placeholder test)
- [ ] 0001_init.sql applies successfully to staging RDS
- [ ] Key tables exist: leads, lead_contacts, lead_consents, lead_attributions, lead_details, lead_status_events, outbox_events, lead_dedupe_claims, lead_auctions, lead_auction_bids

### Fail Conditions
- Can't connect to staging DB from service network
- Migration fails or leaves schema incomplete
- No KMS key exists

### Manual Verification
1. Log in to AWS Console → confirm MFA enabled on root user
2. Connect to staging DB (psql) → verify `SELECT now();` succeeds
3. Run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` and `btree_gist` → no errors
4. Confirm core tables exist: `\dt`
5. Push a trivial commit → confirm GitHub Actions pipeline runs green

---

## Milestone 2 — Admin Dashboard + Site Management + Lead Viewer

### Pass Criteria
- [ ] Admin deployed to staging (ECS Fargate) and reachable via URL
- [ ] Single-user login works (Thiago); logged-out users redirected
- [ ] 5 metros exist with slugs: boston-ma, dallas-tx, houston-tx, atlanta-ga, miami-fl
- [ ] Metro CRUD works
- [ ] 3 verticals exist (painting, cleaning, siding)
- [ ] Default dedupe window = 7 days (editable)
- [ ] Required fields config exists (phone+zip required, email optional)
- [ ] Can create site targets (at least 15 = 3 verticals × 5 metros)
- [ ] Can assign: domain, vertical, metro, template, status
- [ ] Lead list view loads with filters (domain, vertical, metro, status, date)
- [ ] Lead detail view loads with flags (tcpa_consent, dedupe_hit, rejection_reason)

### Fail Conditions
- Admin not accessible or unstable
- Cannot create/manage sites for the 15 targets
- Cannot view leads end-to-end

### Manual Verification
1. Open staging admin URL → loads in browser
2. Attempt access to /leads while logged out → redirected to login
3. Log in → access granted
4. Confirm 5 metros exist with exact slugs
5. Confirm dedupe default = 7 days for each vertical
6. Create at least 5 site targets for one vertical (same vertical, 5 metros)
7. Change status Draft → Review → Approved
8. Insert 1 test lead (via API or DB seed) → confirm it appears in lead list
9. Open lead detail → confirm attribution + consent fields render

---

## Milestone 3 — Content Engine v1 + Templates + Preview

### Pass Criteria
- [ ] Content blocks are typed (discriminated union) in packages/shared
- [ ] Blocks include: hero, service_explainer, local_context, faq, trust_section, process_steps, cta, meta
- [ ] Provider abstraction exists (generateBlocks interface)
- [ ] Provider can be stubbed if API keys not available
- [ ] Generated content records include prompt_version and provider/model metadata
- [ ] Block-level hash tracking prevents exact duplicate blocks across domains
- [ ] Per-domain style seed stored as a setting
- [ ] Public-facing templates implemented and renderable
- [ ] Admin can preview a generated page (HTML render) before publishing

### Fail Conditions
- Content output is untyped/inconsistent and breaks rendering
- No preview path exists
- Templates missing or not renderable

### Manual Verification
1. Select one site target in admin → trigger "Generate Preview"
2. Confirm page preview shows: hero, service explainer, local context, FAQs, CTA
3. Confirm meta fields present (title + description)
4. Generate previews for two different metros → confirm intros/FAQs/local context differ
5. Confirm page preview uses chosen template and is responsive (mobile viewport)

---

## Milestone 4 — Deployment Pipeline + Sites Live + Simplified Capture

### Pass Criteria (minimum: 1 vertical × 5 metros live)
- [ ] Static site generator produces complete file set for at least 1 site target
- [ ] Upload to S3 works
- [ ] CloudFront distribution serves the site
- [ ] TLS cert works (ACM via CloudFront)
- [ ] Route 53 DNS resolves correctly for at least 1 domain
- [ ] sitemap.xml generated and accessible
- [ ] robots.txt present
- [ ] Canonical tags set
- [ ] Meta tags exist (title + description + OG)
- [ ] Basic schema markup present
- [ ] 404 page exists
- [ ] Form submits to simplified ingestion endpoint
- [ ] Required fields enforced: phone + zip + tcpa consent
- [ ] Honeypot + basic rate limit present
- [ ] Lead writes to real lead tables (attribution + consent + contact + details)
- [ ] Lead appears in admin lead viewer within 10 seconds

### Fail Conditions
- Site not reachable on domain with valid TLS
- Form submission does not persist to DB or doesn't show in dashboard
- sitemap/robots/canonical missing

### Manual Verification
1. Deploy one vertical across all 5 metros
2. For each of the 5 sites, visit in browser: loads over HTTPS, cert valid
3. Check /sitemap.xml, /robots.txt, canonical tags, meta tags, 404 page
4. Submit test lead from each of the 5 live targets
5. Confirm each lead appears in admin within 10 seconds
6. For each lead: confirm domain, page_url, metro, tcpa consent are correct
7. Submit form with honeypot filled → should be rejected/flagged
8. Submit same payload twice quickly → second should be deduped/flagged

---

## Milestone 5 — Production Hardening

### Pass Criteria
- [ ] Phone/email encrypted using KMS envelope encryption
- [ ] Hashes stored for dedupe lookups
- [ ] Only Thiago (and prod service roles) can decrypt per KMS policy
- [ ] lead_dedupe_claims exclusion constraint actively used
- [ ] Dedupe policy enforced: store + flag + never queue
- [ ] Blocking vs non-blocking validation clearly separated
- [ ] Junk detection rules active
- [ ] Outbox table written in same transaction as lead writes
- [ ] Outbox poller publishes LeadReceived to SQS
- [ ] LeadReceived includes created_at and event_id
- [ ] consumer_event_receipts exists with TTL cleanup mechanism
- [ ] CloudWatch alarms for: service down, high 5xx, queue backlog, DB errors
- [ ] Load test: 50 concurrent submissions with zero data loss

### Fail Conditions
- PII stored unencrypted in production
- Dedupe can race or fails under double-submit testing
- No alarms/visibility for failures
- Outbox can lose events
- Load test fails with missing data

### Manual Verification
1. Submit a lead → inspect DB: phone/email stored as encrypted bytes
2. Confirm hashes exist for dedupe
3. Submit same phone+zip twice within window: first normal, second flagged + never queued
4. Submit non-dupe lead → confirm outbox row created in same transaction
5. Confirm outbox poller marks it SENT and message exists in SQS
6. Confirm consumer_event_receipts row created when consuming
7. Confirm CloudWatch alarm exists for service 5xx and DB connectivity
8. Run 50 concurrent submissions → verify DB contains expected lead count, no missing outbox rows
