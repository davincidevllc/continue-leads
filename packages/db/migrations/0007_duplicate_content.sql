-- Continue Leads — Duplicate content detection schema (DCD-1)
-- Migration: 0007_duplicate_content.sql
-- Description: Creates pgvector + the three tables used by the duplicate
--              content detection system per docs/duplicate-content-detection.md:
--                page_embeddings           — one Voyage embedding per page version
--                similarity_alerts         — flagged page-pairs awaiting review
--                similarity_trend_snapshots — daily per-brand similarity stats
--              All tenant-scoped via RLS. HNSW index on the vector column
--              for sub-50ms nearest-neighbor queries.
-- Spec: docs/duplicate-content-detection.md
-- Burst: 0p (duplicate-content prep — runs alongside Burst 0e/0f)
--
-- Notes:
--   - pgvector is installed via CREATE EXTENSION; PG 16 on RDS includes it.
--   - 1024-dim vectors match Voyage `voyage-3-lite` (the model chosen in
--     the spec). If we ever switch models, the column dim has to change
--     (vector types are dimension-locked in pgvector).
--   - HNSW chosen over IVFFlat for the index because HNSW handles
--     incremental inserts better and is faster at low-millions vector
--     counts. Tradeoff: more memory.

-- ============================================================
-- pgvector extension
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- page_embeddings — one row per page per content version
-- ============================================================
-- content_version is bumped on each Phase 3 refresh cycle; old embeddings
-- are preserved (lets us trend similarity over time per brand).

CREATE TABLE IF NOT EXISTS page_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    page_id UUID NOT NULL,
    content_version INTEGER NOT NULL,
    model VARCHAR(64) NOT NULL,                            -- "voyage-3-lite"
    embedding vector(1024) NOT NULL,
    source_text_hash TEXT NOT NULL,                        -- SHA-256 of embedded text
    source_text_length INTEGER NOT NULL,                   -- char count
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(page_id, content_version)
);

-- Tenant-scoped fast filter
CREATE INDEX IF NOT EXISTS idx_page_embeddings_tenant
    ON page_embeddings(tenant_id, site_id);

-- HNSW index for sub-50ms nearest-neighbor with cosine distance.
-- (m, ef_construction) tuned per pgvector defaults; revisit if perf
-- degrades at scale.
CREATE INDEX IF NOT EXISTS idx_page_embeddings_vector
    ON page_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE page_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS page_embeddings_tenant_isolation ON page_embeddings;
CREATE POLICY page_embeddings_tenant_isolation ON page_embeddings
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- similarity_alerts — flagged page-pairs awaiting review
-- ============================================================
-- CHECK (page_a_id < page_b_id) gives a canonical ordering so we don't
-- store the same pair twice (e.g., (A,B) and (B,A) collapse to one row).

CREATE TABLE IF NOT EXISTS similarity_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    page_a_id UUID NOT NULL,
    page_b_id UUID NOT NULL,
    similarity_score NUMERIC(5, 4) NOT NULL,
    threshold_at_detection NUMERIC(5, 4) NOT NULL,
    alert_level VARCHAR(20) NOT NULL CHECK (alert_level IN ('warn', 'block')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolution VARCHAR(32),
    resolved_by_user_id UUID,
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (page_a_id < page_b_id)
);

CREATE INDEX IF NOT EXISTS idx_similarity_alerts_tenant_status
    ON similarity_alerts(tenant_id, status, similarity_score DESC);

ALTER TABLE similarity_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS similarity_alerts_tenant_isolation ON similarity_alerts;
CREATE POLICY similarity_alerts_tenant_isolation ON similarity_alerts
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- similarity_trend_snapshots — daily per-brand stats for the trend chart
-- ============================================================

CREATE TABLE IF NOT EXISTS similarity_trend_snapshots (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    page_count INTEGER NOT NULL,
    avg_max_similarity NUMERIC(5, 4) NOT NULL,
    p95_max_similarity NUMERIC(5, 4) NOT NULL,
    pages_over_threshold INTEGER NOT NULL,
    threshold_used NUMERIC(5, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, site_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_similarity_trend_tenant_site_date
    ON similarity_trend_snapshots(tenant_id, site_id, snapshot_date DESC);

ALTER TABLE similarity_trend_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS similarity_trend_snapshots_isolation ON similarity_trend_snapshots;
CREATE POLICY similarity_trend_snapshots_isolation ON similarity_trend_snapshots
    FOR ALL
    TO app_tenant_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- Migration tracking
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('0007_duplicate_content')
    ON CONFLICT (version) DO NOTHING;
