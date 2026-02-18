-- Continue Leads - Initial Schema Migration
-- Migration: 0001_init.sql
-- Description: Complete schema for all phases. Tables for Phase 2/3 exist but remain unused.
-- Extensions: pgcrypto (UUID generation, encryption), btree_gist (exclusion constraints)

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- Dimension Tables (reference data)
-- ============================================================

-- Metros (launch markets)
CREATE TABLE metros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,
    facts JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verticals (service categories)
CREATE TABLE verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    dedupe_window_days INTEGER NOT NULL DEFAULT 7,
    required_fields JSONB NOT NULL DEFAULT '{"phone": true, "zip": true, "email": false, "firstName": false, "lastName": false}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories (broader grouping, V1 = 1:1 with verticals but schema supports many)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    vertical_id UUID NOT NULL REFERENCES verticals(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Services (specific services within a category)
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(category_id, slug)
);

-- Service Types (refinement of services)
CREATE TABLE service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    service_id UUID NOT NULL REFERENCES services(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(service_id, slug)
);

-- Question Sets (qualifying question templates)
CREATE TABLE question_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    service_type_id UUID REFERENCES service_types(id),
    vertical_id UUID NOT NULL REFERENCES verticals(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Question Set Versions (versioned question definitions)
CREATE TABLE question_set_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_set_id UUID NOT NULL REFERENCES question_sets(id),
    version INTEGER NOT NULL,
    questions JSONB NOT NULL DEFAULT '[]',
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(question_set_id, version)
);

-- ============================================================
-- Site / Template Tables (Phase 1 core)
-- ============================================================

-- Templates
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    page_types JSONB NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sites (one per domain)
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) NOT NULL UNIQUE,
    vertical_id UUID NOT NULL REFERENCES verticals(id),
    template_id UUID NOT NULL REFERENCES templates(id),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
    style_seed VARCHAR(100) NOT NULL DEFAULT '',
    consent_text_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Site-Metro junction (which metros a site targets)
CREATE TABLE site_metros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    metro_id UUID NOT NULL REFERENCES metros(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(site_id, metro_id)
);

-- Generated Pages (rendered page records)
CREATE TABLE generated_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    metro_id UUID REFERENCES metros(id),
    page_type VARCHAR(30) NOT NULL,
    url_path VARCHAR(500) NOT NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    content_blocks JSONB NOT NULL DEFAULT '[]',
    content_hash VARCHAR(64) NOT NULL DEFAULT '',
    prompt_version VARCHAR(50) NOT NULL DEFAULT '',
    provider_model VARCHAR(100) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
    generated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(site_id, url_path)
);

-- Prompt Templates (versioned prompts for content generation)
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_slug VARCHAR(50) NOT NULL,
    page_type VARCHAR(30) NOT NULL,
    block_type VARCHAR(30) NOT NULL,
    version VARCHAR(20) NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(vertical_slug, page_type, block_type, version)
);

-- Content Hashes (uniqueness tracking)
CREATE TABLE content_hashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(255) NOT NULL,
    block_type VARCHAR(30) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(content_hash)
);

-- ============================================================
-- Lead Tables (Phase 1 basic capture → Phase 2 full pipeline)
-- ============================================================

-- Leads (core record with routing/value fields)
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id),
    idempotency_key VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'NEW'
        CHECK (status IN ('NEW', 'VALIDATED', 'QUALIFIED', 'QUEUED', 'OFFERED', 'SOLD', 'REJECTED', 'EXPIRED', 'UNSOLD')),
    rejection_reason VARCHAR(50),
    dedupe_hit BOOLEAN NOT NULL DEFAULT false,

    -- Service hierarchy references
    category_id UUID REFERENCES categories(id),
    service_id UUID REFERENCES services(id),
    service_type_id UUID REFERENCES service_types(id),
    question_set_id UUID REFERENCES question_sets(id),
    question_set_version_id UUID REFERENCES question_set_versions(id),

    -- Normalized value drivers (indexed for fast routing)
    urgency VARCHAR(20),
    property_type VARCHAR(20),
    project_size_bucket VARCHAR(20),
    budget_range VARCHAR(20),
    timeframe_days INTEGER,

    -- Location
    targeting_mode VARCHAR(20) NOT NULL DEFAULT 'METRO',
    state VARCHAR(2),
    zip VARCHAR(10),
    radius_miles INTEGER,
    metro_slug VARCHAR(50),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(site_id, idempotency_key)
);

-- Lead Contacts (PII encrypted at rest)
CREATE TABLE lead_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

    -- Encrypted fields (KMS envelope encryption in prod)
    phone_encrypted BYTEA NOT NULL,
    email_encrypted BYTEA,
    first_name_encrypted BYTEA,
    last_name_encrypted BYTEA,

    -- Hashes for dedupe (salted SHA-256)
    phone_hash VARCHAR(128) NOT NULL,
    email_hash VARCHAR(128),

    -- Clear fields (V1)
    ip_address VARCHAR(45),
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(lead_id)
);

-- Lead Attributions
CREATE TABLE lead_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    page_url TEXT NOT NULL,
    page_type VARCHAR(30) NOT NULL DEFAULT '',
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(lead_id)
);

-- Lead Consents (TCPA snapshot per lead)
CREATE TABLE lead_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tcpa_consent BOOLEAN NOT NULL,
    consent_text TEXT NOT NULL,
    consent_text_version VARCHAR(20) NOT NULL,
    consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(lead_id)
);

-- Lead Details (JSONB responses snapshot)
CREATE TABLE lead_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    question_set_id UUID REFERENCES question_sets(id),
    question_set_version_id UUID REFERENCES question_set_versions(id),
    responses JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(lead_id)
);

-- Lead Status Events (append-only audit log)
CREATE TABLE lead_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Dedupe Claims (race-safe, time-window based)
-- ============================================================

CREATE TABLE lead_dedupe_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    claim_hash VARCHAR(128) NOT NULL,
    claim_type VARCHAR(10) NOT NULL CHECK (claim_type IN ('phone', 'email')),
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Exclusion constraint: no overlapping claims for the same hash
    EXCLUDE USING gist (
        claim_hash WITH =,
        tstzrange(window_start, window_end) WITH &&
    )
);

-- ============================================================
-- Outbox (transactional event publishing)
-- ============================================================

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    event_id UUID NOT NULL UNIQUE,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    next_available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consumer Event Receipts (idempotency for SQS consumers)
CREATE TABLE consumer_event_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    consumer_id VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(event_id, consumer_id)
);

-- ============================================================
-- Auction Tables (Phase 3, schema exists early)
-- ============================================================

-- Buyers
CREATE TABLE buyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    endpoint_url TEXT,
    api_key_hash VARCHAR(128),
    timeout_ms INTEGER NOT NULL DEFAULT 5000,
    required_fields JSONB NOT NULL DEFAULT '[]',
    supported_verticals JSONB NOT NULL DEFAULT '[]',
    supported_states JSONB NOT NULL DEFAULT '[]',
    supported_metros JSONB NOT NULL DEFAULT '[]',
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auctions (one per lead, supports retries)
CREATE TABLE lead_auctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NO_BIDS', 'FAILED')),
    attempt_number INTEGER NOT NULL DEFAULT 1,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    winning_bid_id UUID,
    winning_amount_cents INTEGER,
    buyers_pinged INTEGER NOT NULL DEFAULT 0,
    bids_received INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(lead_id)
);

-- Bid Records (every buyer response per auction)
CREATE TABLE lead_auction_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id UUID NOT NULL REFERENCES lead_auctions(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES buyers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'WON', 'LOST', 'TIMEOUT', 'ERROR', 'REJECTED')),
    bid_amount_cents INTEGER,
    response_time_ms INTEGER,
    http_status_code INTEGER,
    error_message TEXT,
    raw_response JSONB,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'CONFIRMED', 'FAILED', 'DISPUTED')),
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    buyer_receipt_id VARCHAR(255),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes (performance + query patterns)
-- ============================================================

-- Leads
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_site_id ON leads(site_id);
CREATE INDEX idx_leads_metro_slug ON leads(metro_slug);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_category_id ON leads(category_id);
CREATE INDEX idx_leads_dedupe_hit ON leads(dedupe_hit) WHERE dedupe_hit = true;

-- Lead contacts (dedupe lookups)
CREATE INDEX idx_lead_contacts_phone_hash ON lead_contacts(phone_hash);
CREATE INDEX idx_lead_contacts_email_hash ON lead_contacts(email_hash) WHERE email_hash IS NOT NULL;

-- Lead attributions
CREATE INDEX idx_lead_attributions_domain ON lead_attributions(domain);

-- Status events
CREATE INDEX idx_lead_status_events_lead_id ON lead_status_events(lead_id);
CREATE INDEX idx_lead_status_events_created_at ON lead_status_events(created_at);

-- Dedupe claims
CREATE INDEX idx_dedupe_claims_hash ON lead_dedupe_claims(claim_hash);
CREATE INDEX idx_dedupe_claims_window ON lead_dedupe_claims(window_end);

-- Outbox
CREATE INDEX idx_outbox_status_available ON outbox_events(status, next_available_at)
    WHERE status = 'PENDING';

-- Consumer receipts
CREATE INDEX idx_consumer_receipts_created ON consumer_event_receipts(created_at);

-- Sites
CREATE INDEX idx_sites_vertical ON sites(vertical_id);
CREATE INDEX idx_sites_status ON sites(status);

-- Generated pages
CREATE INDEX idx_generated_pages_site ON generated_pages(site_id);
CREATE INDEX idx_generated_pages_status ON generated_pages(status);

-- Auctions
CREATE INDEX idx_auctions_status ON lead_auctions(status);
CREATE INDEX idx_auction_bids_auction ON lead_auction_bids(auction_id);
CREATE INDEX idx_auction_bids_buyer ON lead_auction_bids(buyer_id);

-- ============================================================
-- Migration tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('0001_init');
