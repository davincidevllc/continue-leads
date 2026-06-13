-- Continue Leads — Multi-tenancy schema (MT-1)
-- Migration: 0003_multi_tenancy.sql
-- Description: Phase 0 Burst 0b.1 step 1 of 3. Adds the six multi-tenancy
--              tables (tenants, platform_users, tenant_users, sessions,
--              tenant_audit_log, platform_audit_log) and adds a NULLABLE
--              tenant_id column to every existing tenant-scoped table.
--              NULL is allowed at this stage so the migration can land
--              without breaking the running app; MT-3 (0005_multi_tenancy_backfill.sql)
--              backfills the column and flips it to NOT NULL.
-- Spec: docs/multi-tenancy-spec.md

-- ============================================================
-- New tables: top-level platform entities
-- ============================================================

-- tenants: top-level platform customer (LeadSquad, Localize, Internal)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(63) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DELETED')),
    primary_contact_email VARCHAR(255),
    primary_contact_phone VARCHAR(20),
    logo_url TEXT,
    primary_color VARCHAR(7),
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_platform_user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- platform_users: Thiago and any future Continue Leads operator.
-- Lives outside any tenant; can see across all of them.
CREATE TABLE IF NOT EXISTS platform_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenant_users: humans attached to one tenant (Joe, Isis, LeadSquad partners).
-- Email uniqueness scoped per tenant — same email can exist across tenants.
CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('admin', 'ops', 'sales', 'dev')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    invited_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_email
    ON tenant_users(tenant_id, email);

-- sessions: replaces HMAC cookie; server-side revocable.
-- Stores SHA-256 hash of the cookie token, not the token itself.
-- user_type discriminates platform vs tenant sessions; CHECK enforces
-- consistency (platform sessions have platform_user_id; tenant sessions
-- have tenant_user_id + tenant_id).
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT UNIQUE NOT NULL,
    user_type VARCHAR(20) NOT NULL
        CHECK (user_type IN ('platform', 'tenant')),
    platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE,
    tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET,
    user_agent TEXT,
    CHECK (
        (user_type = 'platform'
            AND platform_user_id IS NOT NULL
            AND tenant_user_id IS NULL
            AND tenant_id IS NULL)
        OR
        (user_type = 'tenant'
            AND tenant_user_id IS NOT NULL
            AND tenant_id IS NOT NULL
            AND platform_user_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires
    ON sessions(expires_at) WHERE expires_at > now();

-- tenant_audit_log: tenant-scoped action history.
-- platform_user_id is non-null when a platform user acts on behalf of a tenant
-- (e.g., impersonation, support work).
CREATE TABLE IF NOT EXISTS tenant_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
    platform_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64),
    resource_id VARCHAR(128),
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant_created
    ON tenant_audit_log(tenant_id, created_at DESC);

-- platform_audit_log: cross-tenant or platform-level actions.
-- Records tenant lifecycle changes, impersonation start/stop, etc.
CREATE TABLE IF NOT EXISTS platform_audit_log (
    id BIGSERIAL PRIMARY KEY,
    platform_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created
    ON platform_audit_log(created_at DESC);

-- ============================================================
-- Add nullable tenant_id to existing tenant-scoped tables
-- ============================================================
-- Done in MT-1 as nullable so the running app keeps working. MT-3 backfills
-- these and flips them to NOT NULL.
--
-- This covers tables from BOTH migration systems:
--   - packages/db/migrations/0001_init.sql (canonical)
--   - /migrations/*.sql (legacy raw SQL, also applied to staging)
-- The dual-migration-system situation is tracked as a Known Issue for
-- future consolidation.

-- --- From 0001_init.sql (canonical schema) ---

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE site_metros
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE generated_pages
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE content_hashes
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_contacts
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_attributions
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_consents
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_details
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_status_events
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_dedupe_claims
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE outbox_events
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE consumer_event_receipts
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE buyers
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_auctions
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE lead_auction_bids
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- --- From /migrations/ (legacy schema, also live on staging) ---
-- Guarded by EXISTS checks so this migration is safe to apply even if the
-- legacy schema was never run on this database.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'site_pages') THEN
        ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'site_target_states') THEN
        ALTER TABLE site_target_states ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'site_target_counties') THEN
        ALTER TABLE site_target_counties ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'site_target_zips') THEN
        ALTER TABLE site_target_zips ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'site_target_cities') THEN
        ALTER TABLE site_target_cities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'generation_jobs') THEN
        ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'generation_job_items') THEN
        ALTER TABLE generation_job_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'qa_runs') THEN
        ALTER TABLE qa_runs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'qa_findings') THEN
        ALTER TABLE qa_findings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'blog_posts') THEN
        ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
    END IF;
END
$$;

-- ============================================================
-- Indexes on tenant_id (required for RLS policy lookups)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sites_tenant ON sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_metros_tenant ON site_metros(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_pages_tenant ON generated_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_hashes_tenant ON content_hashes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_tenant ON lead_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_attributions_tenant ON lead_attributions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_consents_tenant ON lead_consents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_details_tenant ON lead_details(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_events_tenant ON lead_status_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_dedupe_claims_tenant ON lead_dedupe_claims(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant ON outbox_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consumer_event_receipts_tenant ON consumer_event_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buyers_tenant ON buyers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_auctions_tenant ON lead_auctions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_auction_bids_tenant ON lead_auction_bids(tenant_id);

-- Legacy tables (guarded — only index if column was added above)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'site_pages' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_site_pages_tenant ON site_pages(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'site_target_states' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_site_target_states_tenant ON site_target_states(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'site_target_counties' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_site_target_counties_tenant ON site_target_counties(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'site_target_zips' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_site_target_zips_tenant ON site_target_zips(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'site_target_cities' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_site_target_cities_tenant ON site_target_cities(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'generation_jobs' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_generation_jobs_tenant ON generation_jobs(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'generation_job_items' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_generation_job_items_tenant ON generation_job_items(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'qa_runs' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_qa_runs_tenant ON qa_runs(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'qa_findings' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_qa_findings_tenant ON qa_findings(tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'blog_posts' AND column_name = 'tenant_id') THEN
        CREATE INDEX IF NOT EXISTS idx_blog_posts_tenant ON blog_posts(tenant_id);
    END IF;
END
$$;

-- ============================================================
-- Migration tracking
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('0003_multi_tenancy')
    ON CONFLICT (version) DO NOTHING;
