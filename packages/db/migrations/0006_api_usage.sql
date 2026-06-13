-- Continue Leads — API usage tracking (COST-1)
-- Migration: 0006_api_usage.sql
-- Description: Phase 0 Burst 0f step 1. Creates the api_usage table that
--              tracks every external API call across providers (Anthropic
--              Claude in Phase 3, Voyage embeddings in duplicate detection,
--              Flux image gen later, etc.). Tenant-scoped via RLS. Indexes
--              tuned for the cost-dashboard queries: tenant × time, brand
--              × time, and per-model rollups.
-- Spec: docs/phase-0-plan.md (Burst 0f), docs/duplicate-content-detection.md
--       (mentions api_usage), docs/image-strategy.md (mentions api_usage).
--
-- Notes:
--   - cost_usd is NUMERIC(12,6) — enough precision for per-call micro-costs
--     ($0.000024 per embedding) without overflowing aggregate sums.
--   - cached_input_tokens stays nullable because not every provider has a
--     prompt-cache concept (Voyage doesn't, Flux doesn't).
--   - error column tracks failed calls so we can see API-error rate per
--     provider in the dashboard, not just spend.
--   - request_id is the provider's correlation ID (Anthropic returns one
--     in the response headers) — invaluable when debugging "this call
--     looks weird."

-- ============================================================
-- api_usage
-- ============================================================

CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    provider VARCHAR(32) NOT NULL CHECK (provider IN ('anthropic', 'voyage', 'flux', 'stability', 'dalle')),
    model VARCHAR(64) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER,
    cache_creation_input_tokens INTEGER,
    cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    request_id TEXT,
    error TEXT,
    latency_ms INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes (sized for the queries in the cost dashboard)
-- ============================================================

-- Per-tenant time-range scan: "show me last 30 days of spend for tenant X"
CREATE INDEX IF NOT EXISTS idx_api_usage_tenant_created
    ON api_usage(tenant_id, created_at DESC);

-- Per-brand attribution: "how much did this brand cost"
CREATE INDEX IF NOT EXISTS idx_api_usage_brand_created
    ON api_usage(brand_id, created_at DESC)
    WHERE brand_id IS NOT NULL;

-- Provider/model rollup: "Claude spend across all tenants this month"
-- (used by the platform-admin cost view)
CREATE INDEX IF NOT EXISTS idx_api_usage_provider_model_created
    ON api_usage(provider, model, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_usage_tenant_isolation ON api_usage;
CREATE POLICY api_usage_tenant_isolation ON api_usage
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- Migration tracking
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('0006_api_usage')
    ON CONFLICT (version) DO NOTHING;
