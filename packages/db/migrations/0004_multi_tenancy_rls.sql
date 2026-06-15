-- Continue Leads — Multi-tenancy RLS + DB roles (MT-2)
-- Migration: 0004_multi_tenancy_rls.sql
-- Description: Phase 0 Burst 0b.1 step 2 of 3. Creates the two app-level
--              database roles (app_tenant_user, app_platform_user), grants
--              privileges, enables Row-Level Security on every tenant-scoped
--              table, and writes RLS policies that filter by the per-request
--              session variable app.current_tenant_id.
-- Spec: docs/multi-tenancy-spec.md
--
-- IMPORTANT — does NOT break the running app:
-- The app currently connects as the RDS master user (cladmin), which is a
-- PostgreSQL superuser and therefore BYPASSes RLS by default. Enabling RLS
-- here has zero effect on the running app's queries. The new roles are
-- prepared so MT-4 (db-context wrapper) can switch the app to use them
-- on a per-request basis later.

-- ============================================================
-- DB Roles
-- ============================================================
-- PostgreSQL doesn't have CREATE ROLE IF NOT EXISTS; use DO + check.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant_user') THEN
        CREATE ROLE app_tenant_user NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_user') THEN
        CREATE ROLE app_platform_user NOINHERIT BYPASSRLS;
    END IF;
END
$$;

-- Schema usage
GRANT USAGE ON SCHEMA public TO app_tenant_user, app_platform_user;

-- Table privileges
GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO app_tenant_user, app_platform_user;

-- Sequence privileges (BIGSERIAL needs USAGE on the seq)
GRANT USAGE
    ON ALL SEQUENCES IN SCHEMA public
    TO app_tenant_user, app_platform_user;

-- Future tables/sequences inherit the same privileges automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
    TO app_tenant_user, app_platform_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES
    TO app_tenant_user, app_platform_user;

-- ============================================================
-- RLS — tenants table
-- ============================================================
-- The tenants table itself uses `id` (not `tenant_id`) as the discriminator
-- because each row IS a tenant. Tenant users see only their own row.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_self_isolation ON tenants;
CREATE POLICY tenants_self_isolation ON tenants
    FOR ALL
    TO app_tenant_user
    USING (id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- RLS — tenant_users (one tenant only sees their own users)
-- ============================================================

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_users_isolation ON tenant_users;
CREATE POLICY tenant_users_isolation ON tenant_users
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- RLS — tenant_audit_log
-- ============================================================

ALTER TABLE tenant_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_audit_log_isolation ON tenant_audit_log;
CREATE POLICY tenant_audit_log_isolation ON tenant_audit_log
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- Sessions, platform_users, platform_audit_log — NO RLS
-- ============================================================
-- - sessions: lookup is by token_hash (unique SHA-256). No RLS needed; the
--   token IS the security boundary. The app reads sessions during the
--   middleware phase BEFORE tenant context is established.
-- - platform_users: only platform-level operators read this table. RLS
--   would require a separate "platform context" mechanism that's overkill.
--   App-level auth enforces the boundary.
-- - platform_audit_log: same as platform_users — platform-only by design.

-- ============================================================
-- RLS — tenant-scoped tables from 0001_init.sql
-- ============================================================

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sites_tenant_isolation ON sites;
CREATE POLICY sites_tenant_isolation ON sites
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE site_metros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_metros_tenant_isolation ON site_metros;
CREATE POLICY site_metros_tenant_isolation ON site_metros
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE generated_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS generated_pages_tenant_isolation ON generated_pages;
CREATE POLICY generated_pages_tenant_isolation ON generated_pages
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE content_hashes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_hashes_tenant_isolation ON content_hashes;
CREATE POLICY content_hashes_tenant_isolation ON content_hashes
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_tenant_isolation ON leads;
CREATE POLICY leads_tenant_isolation ON leads
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_contacts_tenant_isolation ON lead_contacts;
CREATE POLICY lead_contacts_tenant_isolation ON lead_contacts
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_attributions_tenant_isolation ON lead_attributions;
CREATE POLICY lead_attributions_tenant_isolation ON lead_attributions
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_consents_tenant_isolation ON lead_consents;
CREATE POLICY lead_consents_tenant_isolation ON lead_consents
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_details_tenant_isolation ON lead_details;
CREATE POLICY lead_details_tenant_isolation ON lead_details
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_status_events_tenant_isolation ON lead_status_events;
CREATE POLICY lead_status_events_tenant_isolation ON lead_status_events
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_dedupe_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_dedupe_claims_tenant_isolation ON lead_dedupe_claims;
CREATE POLICY lead_dedupe_claims_tenant_isolation ON lead_dedupe_claims
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
CREATE POLICY outbox_events_tenant_isolation ON outbox_events
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE consumer_event_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consumer_event_receipts_tenant_isolation ON consumer_event_receipts;
CREATE POLICY consumer_event_receipts_tenant_isolation ON consumer_event_receipts
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyers_tenant_isolation ON buyers;
CREATE POLICY buyers_tenant_isolation ON buyers
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_auctions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_auctions_tenant_isolation ON lead_auctions;
CREATE POLICY lead_auctions_tenant_isolation ON lead_auctions
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE lead_auction_bids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_auction_bids_tenant_isolation ON lead_auction_bids;
CREATE POLICY lead_auction_bids_tenant_isolation ON lead_auction_bids
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- RLS — tenant-scoped tables from /migrations/ (legacy)
-- ============================================================
-- Guarded by EXISTS checks so this migration is safe to apply even if the
-- legacy schema isn't present.

DO $$
DECLARE
    legacy_tables TEXT[] := ARRAY[
        'site_pages',
        'site_target_states',
        'site_target_counties',
        'site_target_zips',
        'site_target_cities',
        'generation_jobs',
        'generation_job_items',
        'qa_runs',
        'qa_findings',
        'blog_posts'
    ];
    tbl TEXT;
    policy_name TEXT;
BEGIN
    FOREACH tbl IN ARRAY legacy_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

            policy_name := tbl || '_tenant_isolation';
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, tbl);
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL TO app_tenant_user '
                'USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid) '
                'WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid)',
                policy_name, tbl
            );
        END IF;
    END LOOP;
END
$$;

-- ============================================================
-- Migration tracking
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('0004_multi_tenancy_rls')
    ON CONFLICT (version) DO NOTHING;
