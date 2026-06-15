-- Continue Leads — Multi-tenancy backfill (MT-3a)
-- Migration: 0005_multi_tenancy_backfill.sql
-- Description: Phase 0 Burst 0b.1 step 3 of 3. Deletes the leftover E2E
--              test brand, seeds the 'internal' platform tenant, and
--              backfills tenant_id on every row that still has it NULL.
-- Spec: docs/multi-tenancy-spec.md
--
-- Scope note: This migration backfills data only. The NOT NULL flip on
-- tenant_id columns is DEFERRED to a later migration that runs AFTER
-- the API routes are refactored (MT-8) to provide tenant_id on every
-- INSERT. Flipping NOT NULL now would break the running app's brand
-- creation flow until MT-4 → MT-8 land.

-- ============================================================
-- 1. Delete the E2E test brand
-- ============================================================
-- Test brand created during the Phase 1 E2E wizard run (2026-05-03):
--   id    = 68adfd7a-42b4-48e8-9be0-b338cdcbbaa9
--   domain= cl-e2e-painting-ma-20260503.com
-- Per CLAUDE.md Known Issues, this brand has no UI value and we agreed
-- to delete rather than backfill. ON DELETE CASCADE on child tables
-- (site_pages, site_target_*, site_metros, generated_pages, etc.)
-- cleans up dependent rows automatically.

DELETE FROM sites
    WHERE id = '68adfd7a-42b4-48e8-9be0-b338cdcbbaa9';

-- ============================================================
-- 2. Seed the internal tenant
-- ============================================================
-- A fixed UUID so this seed is reproducible across environments and
-- makes for predictable references in code/tests.

INSERT INTO tenants (
    id,
    slug,
    display_name,
    legal_name,
    status,
    primary_contact_email,
    settings
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'internal',
    'Continue Leads Internal',
    NULL,
    'ACTIVE',
    'thiago@continueleads.com',
    '{}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 3. Backfill tenant_id on every tenant-scoped table
-- ============================================================
-- All current rows belong to the platform-owned 'internal' tenant since
-- no real tenant has been onboarded yet. Idempotent — second run finds
-- nothing to update.

DO $$
DECLARE
    internal_tenant_id UUID;
    canonical_tables TEXT[] := ARRAY[
        'sites',
        'site_metros',
        'generated_pages',
        'content_hashes',
        'leads',
        'lead_contacts',
        'lead_attributions',
        'lead_consents',
        'lead_details',
        'lead_status_events',
        'lead_dedupe_claims',
        'outbox_events',
        'consumer_event_receipts',
        'buyers',
        'lead_auctions',
        'lead_auction_bids'
    ];
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
BEGIN
    SELECT id INTO internal_tenant_id FROM tenants WHERE slug = 'internal';

    IF internal_tenant_id IS NULL THEN
        RAISE EXCEPTION 'internal tenant not found — seed step must have failed';
    END IF;

    -- Canonical schema (0001_init.sql tables — always present)
    FOREACH tbl IN ARRAY canonical_tables
    LOOP
        EXECUTE format(
            'UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL',
            tbl
        )
        USING internal_tenant_id;
    END LOOP;

    -- Legacy schema (/migrations/ tables — may not exist on every database)
    FOREACH tbl IN ARRAY legacy_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
        ) THEN
            EXECUTE format(
                'UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL',
                tbl
            )
            USING internal_tenant_id;
        END IF;
    END LOOP;
END
$$;

-- ============================================================
-- 4. Sanity check (raises on unexpected state)
-- ============================================================

DO $$
DECLARE
    null_count INTEGER;
    internal_count INTEGER;
BEGIN
    -- After backfill, sites.tenant_id should never be NULL.
    SELECT COUNT(*) INTO null_count FROM sites WHERE tenant_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'sites still has % rows with NULL tenant_id after backfill', null_count;
    END IF;

    -- Exactly one internal tenant should exist.
    SELECT COUNT(*) INTO internal_count FROM tenants WHERE slug = 'internal';
    IF internal_count <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 internal tenant, found %', internal_count;
    END IF;
END
$$;

-- ============================================================
-- Migration tracking
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('0005_multi_tenancy_backfill')
    ON CONFLICT (version) DO NOTHING;
