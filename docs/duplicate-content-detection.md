# Duplicate Content Detection Spec

**Status:** Draft, written 2026-05-XX
**Author:** Thiago + Claude
**Depends on:** `multi-tenancy-spec.md` (uses tenant_id for scoping)
**Relates to:** Phase 4 QA Agent (which integrates this); the SEO/AEO strategy

## Why this matters

Programmatic SEO at scale lives or dies by content uniqueness.

Continue Leads will generate hundreds of pages per brand and dozens of brands per tenant. Without aggressive duplicate detection, three things happen:

1. **Within-brand duplication.** Two "Painters in Boston" and "Painters in Cambridge" pages end up 92% identical because they share boilerplate. Google detects it, ranks neither.
2. **Cross-brand-within-tenant duplication.** LeadSquad runs 10 painting brands across the Northeast. If they share template-driven content with only city/state token swaps, Google figures out the doorway pattern and penalizes the whole network.
3. **Quiet drift.** Content refreshes (Phase 3 recurring cron) regenerate pages every ~12 months. Without measurement, similarity scores can creep UP over time as Claude converges on its own patterns. We need to see the trend.

The Master Plan referenced a "similarity threshold" but didn't specify the mechanism, the cost model, the UI, or the QA integration. This doc owns all of that.

## Why embeddings, not LLM analysis

The naive approach: feed every page-pair to Claude with "are these duplicates? score 0-1." That's wildly expensive — for N pages, you have N²/2 comparisons. At 1,000 pages = 500,000 LLM calls. At any realistic LLM price, that's tens of thousands of dollars per scan.

The right approach: **embeddings**. Convert each page to a fixed-length vector (~1,024 floats), then similarity becomes vector math (cosine similarity). Vector math is essentially free; the only cost is embedding each page ONCE.

| Operation | Cost per page | Time per page | One-time or recurring |
|---|---|---|---|
| Embed page (Voyage `voyage-3-lite`) | ~$0.000024 | ~150ms | Once per content version |
| Cosine similarity between two embeddings | ~$0 (pure math) | <1ms | Recurring, free |
| Storage (1,024-dim float32 vector) | ~4KB in pgvector | — | Persisted |

So the cost of detecting duplicates across 10,000 pages is $0.24 to embed them + $0 to compare all 50,000,000 pairs. Same scale comparison via LLM = $50,000+.

## Embedding model — Voyage AI `voyage-3-lite`

Chosen because:
- **Anthropic-recommended.** Anthropic doesn't offer first-party embeddings; their docs point at Voyage as the preferred partner.
- **Cheap.** $0.02 per 1M tokens. For ~1,200-token money pages: ~$0.000024 each.
- **Good enough.** voyage-3-lite is the right tier for "is this content meaningfully different" — not the top model, but well-suited to similarity detection.
- **1,024 dimensions** — small enough that pgvector handles millions of vectors fast.

Alternatives considered:
- **OpenAI text-embedding-3-small** — comparable price, comparable quality, but introduces an OpenAI account dependency. We want to keep API dependencies minimal.
- **Self-hosted sentence-transformers** — free per-token, but requires hosting infra (a small GPU instance or careful CPU optimization). Not worth the complexity at our scale.
- **Voyage voyage-3 (full)** — higher quality, ~3× the cost. We'll evaluate switching after we have baseline data; lite is fine for v1.

## Storage — pgvector

[pgvector](https://github.com/pgvector/pgvector) is a Postgres extension that adds a `vector(N)` column type and cosine/L2/inner-product distance operators. It runs INSIDE our existing RDS instance.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Cost: zero. The extension is open source, runs in our existing Postgres process, no separate vector DB to host.

Performance: pgvector supports IVFFlat and HNSW indexes for sub-millisecond approximate similarity searches across millions of vectors. We don't need it that fast initially — exact search across one tenant's pages is fine up to ~100,000 pages per tenant.

## Data model

### Tables

```sql
-- One embedding per page (per content version)
CREATE TABLE page_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,                                 -- denormalized for fast filtering
  page_id UUID NOT NULL,                                 -- references site_pages.id
  content_version INTEGER NOT NULL,                      -- bumped each refresh; embeds replaced
  model VARCHAR(64) NOT NULL,                            -- "voyage-3-lite"
  embedding vector(1024) NOT NULL,
  source_text_hash TEXT NOT NULL,                        -- SHA-256 of the text that was embedded
  source_text_length INTEGER NOT NULL,                   -- char count, for debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, content_version)
);

-- Tenant-scoped RLS (per multi-tenancy spec)
ALTER TABLE page_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY page_embeddings_tenant_isolation ON page_embeddings FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- HNSW index for fast similarity queries
CREATE INDEX idx_page_embeddings_vector ON page_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Filter index for tenant-scoped queries
CREATE INDEX idx_page_embeddings_tenant ON page_embeddings(tenant_id, site_id);

-- A flagged pair waiting for review or resolution
CREATE TABLE similarity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_a_id UUID NOT NULL,
  page_b_id UUID NOT NULL,
  similarity_score NUMERIC(5,4) NOT NULL,                -- 0.0000 to 1.0000
  threshold_at_detection NUMERIC(5,4) NOT NULL,          -- what the threshold was when flagged
  alert_level VARCHAR(20) NOT NULL CHECK (alert_level IN ('warn', 'block')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution VARCHAR(20),                                -- "regenerated_a", "regenerated_b", "accepted_intentional", "deleted_a", "deleted_b"
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (page_a_id < page_b_id)                          -- canonical ordering avoids dup pair rows
);

ALTER TABLE similarity_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY similarity_alerts_tenant_isolation ON similarity_alerts FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX idx_similarity_alerts_tenant_status ON similarity_alerts(tenant_id, status, similarity_score DESC);

-- Time-series snapshot for trend tracking
CREATE TABLE similarity_trend_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  page_count INTEGER NOT NULL,
  avg_max_similarity NUMERIC(5,4) NOT NULL,              -- avg, across pages, of each page's nearest-neighbor similarity
  p95_max_similarity NUMERIC(5,4) NOT NULL,              -- 95th percentile of same
  pages_over_threshold INTEGER NOT NULL,
  threshold_used NUMERIC(5,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, site_id, snapshot_date)
);

CREATE INDEX idx_similarity_trend_tenant_site_date ON similarity_trend_snapshots(tenant_id, site_id, snapshot_date DESC);
```

### Why no cross-tenant comparison

A natural question: should we compare LeadSquad's pages against Boston Co's pages?

**No.** Three reasons:

1. **Isolation violation.** A core multi-tenancy guarantee is that one tenant cannot affect another. A similarity alert that says "your page is 88% similar to a Boston Co page" leaks information across tenants.
2. **False positives by design.** Two tenants legitimately running painting lead-gen in similar markets will have meaningful overlap. That's not a Google penalty risk for either tenant — Google judges per-domain quality, and different tenants own different domains.
3. **Doesn't help.** What action would a tenant take? They can't see the other tenant's content. They can't request changes. The alert is unactionable.

Cross-tenant comparison gets filtered out at the SQL layer (via RLS). Embeddings are tenant-isolated by default.

**What we DO compare:**

- Pages within the same brand (most common duplication risk)
- Pages across brands within the same tenant (cross-brand boilerplate detection)

## Thresholds and severity

Cosine similarity is normalized 0.0 (no relationship) to 1.0 (identical). For well-written long-form local SEO content:

| Score range | What it usually means | Default behavior |
|---|---|---|
| **0.95 – 1.00** | Near-identical text. Almost certainly a templated copy. | **Hard block.** Page cannot be flipped to `indexable`. |
| **0.85 – 0.94** | Heavy overlap. Likely template + token swaps. | **Hard block.** Review required. |
| **0.75 – 0.84** | Meaningful overlap. Same vertical/city/service combos hit this naturally. | **Soft warn.** Surfaces in dashboard but doesn't block indexing. |
| **0.65 – 0.74** | Some thematic overlap (same vertical) but different content. | No alert. |
| **< 0.65** | Distinct content. | No alert. |

### Default thresholds

- `block_threshold`: **0.85** — anything ≥ this fails QA, page cannot index
- `warn_threshold`: **0.75** — anything ≥ this surfaces in the dashboard

### Per-tenant tunable

Both thresholds are stored in `tenants.settings.duplicate_content`:

```jsonc
{
  "duplicate_content": {
    "model": "voyage-3-lite",
    "block_threshold": 0.85,
    "warn_threshold": 0.75,
    "scope": "tenant",                 // future: "brand" if a tenant wants stricter intra-brand only
    "snapshot_cron": "daily"           // future: "hourly" for high-velocity tenants
  }
}
```

A tenant can request stricter thresholds (e.g., 0.70 / 0.60) once they have data. Platform admin can override.

## The pipeline

### When does embedding happen?

After content generation (Phase 3 Content Agent) completes for a page, but before QA Agent (Phase 4) runs.

```
Content Agent writes content_blocks to site_pages
  → triggers EMBED_PAGE job for that page
  → Embed worker fetches page text → calls Voyage API → INSERTs row in page_embeddings
  → triggers SIMILARITY_CHECK job for that page
  → Similarity worker runs pgvector query (top 20 nearest pages within tenant)
  → For each result above warn_threshold, INSERT similarity_alerts row
  → For each result above block_threshold, also INSERT qa_findings row (severity=blocking)
  → triggers QA_RUN job (standard QA Agent pipeline)
```

### What text gets embedded

Money pages include hero copy + body content + FAQ Q&As + meta description. Excluded from the embedding:
- Header / footer / nav (boilerplate, would create false positives)
- Trust badges (shared across all pages by design)
- Form labels (shared)
- Image alt text (separate workstream)

Embedded text is hashed (`source_text_hash`) so we can detect if a refresh produces identical text (skip re-embedding to save cost).

### Refresh cycle interaction

Content refresh (Phase 3, ~12-month cron) regenerates page content. Each refresh:

1. Bumps `content_version` on `site_pages`
2. Triggers a fresh `EMBED_PAGE` job → new row in `page_embeddings`
3. Old embedding row preserved (allows trend analysis: "is our content getting MORE similar to itself over time?")
4. Re-runs similarity check against current pages

Important: when comparing similarity, queries use the LATEST `content_version` per page. Old embeddings are reference only.

## The dashboard

Lives at `{tenant-slug}.continueleads.com/qa/duplicates` (tenant Ops + Admin roles).

### View 1 — Tenant overview

Top-level summary card:
- Total pages in scope
- Pages with at least one warn-level neighbor
- Pages with at least one block-level neighbor (= can't index until resolved)
- 30-day trend: average max-similarity across all pages (line chart, should be flat or trending down)

### View 2 — Brand-vs-brand heatmap

Grid: N brands × N brands. Each cell shows the highest similarity found between any page in brand-row and any page in brand-column.

Color-coded:
- Green: < 0.65 (no concern)
- Yellow: 0.65 – 0.74 (some overlap, monitor)
- Orange: 0.75 – 0.84 (warn level)
- Red: 0.85+ (block level — at least one page in each pair is blocked from indexing)

Click any cell → drill into the page-pair grid for those two brands.

### View 3 — Within-brand grid

For a single brand: N pages × N pages, same color scheme. Quickly spot clusters of self-similar pages.

Sort options:
- By page type (group all money pages together — these are the highest-risk category)
- By city alphabetical
- By creation date (find which generation batch was lazy)

### View 4 — Alert queue

List of all `similarity_alerts` with `status = 'open'`, sorted by score descending. Each row:
- Page A — title, brand, URL
- Page B — title, brand, URL
- Score (with severity badge)
- "Compare" button → side-by-side diff view
- Action buttons: Regenerate A | Regenerate B | Accept (intentional) | Dismiss

### View 5 — Page-pair compare

Side-by-side rendering of the two pages' embedded text, with passages auto-highlighted by similarity. (Built later; rough text diff is fine for v1.)

### View 6 — Trend chart

Per brand, plot `avg_max_similarity` and `p95_max_similarity` over time. Snapshots taken daily by cron. Refresh cycles should produce visible drops.

## QA Agent integration

The QA Agent (Phase 4) runs a battery of checks per page. Duplicate detection is one of them.

**QA pass criteria related to duplicates:**

- No `similarity_alerts` row exists with `status='open' AND alert_level='block' AND (page_a_id = $page OR page_b_id = $page)`
- That is: a page can only flip to `indexable` if every block-level alert involving it is resolved.

**`qa_findings` written:**

```jsonc
{
  "qa_run_id": "...",
  "page_id": "...",
  "category": "duplicate_content",
  "severity": "blocking",
  "message": "Page is 0.89 similar to /boston-ma/exterior-painting (brand: BostonPainters). Indexing blocked until resolved.",
  "metadata": {
    "compared_page_id": "...",
    "score": 0.89,
    "threshold": 0.85
  }
}
```

## Cost model

### Per-page cost (one-time)

Voyage `voyage-3-lite`: $0.02 per 1M tokens. Typical money page = ~1,200 tokens.

```
1,200 tokens × ($0.02 / 1,000,000 tokens) = $0.000024 per page
```

### Storage cost

pgvector vectors are stored in Postgres at ~4KB per vector (1,024 dims × 4 bytes). Negligible at any realistic scale (10,000 vectors = 40MB).

### Compute cost

Pure SQL via pgvector. Cosine similarity across 100,000 vectors with HNSW index: <50ms. Zero variable cost.

### Total at scale

| Scale | One-time embed cost | Monthly recurring (refresh cycle) |
|---|---|---|
| 1,000 pages | $0.024 | $0.002 (assuming 1/12 refreshed per month) |
| 10,000 pages | $0.24 | $0.02 |
| 100,000 pages | $2.40 | $0.20 |
| 1,000,000 pages | $24 | $2 |

Duplicate detection is **the cheapest part of the platform.** No reason to skimp here.

### Cost guardrail

Embedding cost is metered the same way the Content Agent's costs will be (separate doc in Phase 3). `api_usage` table gets rows for each Voyage call. Daily cost dashboard shows Voyage spend.

## Implementation tasks (atomic)

Standalone module. Most tasks slot into Phase 3 (after Content Agent) and Phase 4 (QA Agent), but the schema is independent and can land earlier as Burst 0.x if we want the dashboard visible before content generation works.

### DCD-1 — pgvector setup + page_embeddings table (45 min)
- Enable extension on RDS staging
- Migration: `page_embeddings`, `similarity_alerts`, `similarity_trend_snapshots`
- HNSW index on the vector column
- RLS policies (per multi-tenancy spec)
- Verify with `\d+ page_embeddings` in psql

### DCD-2 — Voyage integration + embed worker (60 min)
- `apps/admin/src/lib/voyage.ts` — wrapper around Voyage API with retry
- `apps/admin/src/lib/embed-page.ts` — extract embeddable text from a page, call Voyage, store row
- Secret: `VOYAGE_API_KEY` in Secrets Manager
- Track usage in `api_usage` table

### DCD-3 — Similarity check function (60 min)
- SQL function `find_similar_pages(p_page_id UUID, p_top_n INT, p_min_score NUMERIC)` returning top-N nearest neighbors with score
- Tenant-scoped via RLS
- Worker that calls this function after embedding, writes `similarity_alerts` for hits

### DCD-4 — QA Agent integration (45 min)
- QA Agent pipeline gains a "duplicate_content" check
- Writes `qa_findings` blocking entries for block-threshold alerts
- A page with an open block-level alert can't flip to `indexable`

### DCD-5 — Alert queue UI (90 min)
- `{slug}/qa/duplicates` route — list view
- Filter by score range, status, brand
- Action buttons (regenerate, accept, dismiss)
- Tenant Ops + Admin roles only

### DCD-6 — Heatmap UI (brand-vs-brand) (90 min)
- Grid view with cell color coding
- Drill-down navigation
- Mobile-responsive (grid collapses to scrollable horizontal list on narrow screens)

### DCD-7 — Within-brand grid + page-pair compare (90 min)
- Single-brand grid view
- Page-pair side-by-side diff (simple text comparison for v1)
- Re-runs sort options

### DCD-8 — Trend snapshots cron (45 min)
- Daily cron computes `similarity_trend_snapshots` per tenant per brand
- Backfill historical via on-demand button (for once we have data to backfill)

### DCD-9 — Trend chart UI (45 min)
- Time-series line chart per brand
- Toggle: avg vs p95
- Overlay refresh-cycle events

### DCD-10 — Per-tenant threshold settings UI (30 min)
- Tenant settings page gains "Duplicate content" section
- Admin can override defaults
- Validation: warn_threshold < block_threshold, both in [0.5, 0.99]

**Total estimate:** ~9-10 hours of focused work.

## Tenant isolation guarantees

Recapping how the multi-tenancy isolation spec applies here:

- `page_embeddings` has RLS — a tenant only sees their own embeddings
- `similarity_alerts` has RLS — a tenant only sees their own alerts
- `find_similar_pages()` SQL function inherits RLS — searches only return same-tenant matches
- Cross-tenant similarity is impossible at the data layer
- The dashboard never displays counts/aggregates that would let a tenant infer activity in another tenant

## What this protects against (and doesn't)

**Protected:**
- Within-brand duplicate pages
- Cross-brand-within-tenant duplicate pages
- Quiet content drift during refresh cycles (visible in trend chart)
- "Accidentally copy/pasted the wrong prompt" — surfaces fast

**Not protected (different workstreams):**
- **Cross-tenant duplication** — by design (isolation)
- **External duplication** — someone else copying our content (Google handles via canonical signals; we can't actively defend)
- **Image similarity** — separate workstream. AI-generated images per vertical (from Gerry) need similar treatment but a different model (perceptual hashing or CLIP-style image embeddings)
- **Style/voice fingerprinting** — we measure semantic similarity, not "all pages sound like the same writer." If we ever want voice variety per brand, that's a content-prompt-engineering concern, not a similarity-detection concern
- **Schema markup duplication** — most pages SHOULD have similar schema structure; that's not penalized

## Open decisions

These can be deferred to implementation but worth flagging now:

1. **Where does the embedding cost roll up in cost dashboards?** Tag Voyage usage as `provider=voyage` in `api_usage`. Cost dashboard groups by provider.
2. **Manual override approval flow.** If a tenant Admin clicks "Accept as intentional" on a 0.92 similarity pair (override block), should it require a typed reason? My rec: **yes, required**, stored in `notes`. Audit trail matters for SEO troubleshooting later.
3. **Cross-tenant comparison FOR PLATFORM ADMIN** — should you, as Thiago, be able to see cross-tenant duplication patterns from the platform admin view? Useful for spotting tenants accidentally fighting each other for the same keywords. My rec: **yes, platform-only view**, never exposed to tenant users. Build later if needed.
4. **Image similarity** — schedule as a separate spec for Phase 3+. Same pattern (embed once, compare cheap) but a different model.
5. **What to do when a page is split across multiple regenerations to lower similarity** — e.g., page A is 0.91 similar to B; we regenerate A; new A is 0.88 similar to C. Iteration risk. Build a max-retry rule into the QA pipeline (e.g., after 3 regenerations, escalate to manual review).

## Glossary

| Term | Meaning |
|---|---|
| Embedding | Fixed-length vector representing a page's semantic content |
| Cosine similarity | Dot product of two normalized vectors; 0.0 = unrelated, 1.0 = identical |
| pgvector | Postgres extension adding `vector(N)` column type + similarity operators |
| HNSW | Hierarchical Navigable Small World — an index type pgvector supports for fast approximate nearest neighbor search |
| Voyage | Anthropic-recommended embeddings provider (https://voyageai.com) |
| `block_threshold` | Score above which a page CANNOT flip to `indexable` until resolved |
| `warn_threshold` | Score above which a similarity alert surfaces in the dashboard (but doesn't block indexing) |
| Content version | Counter on `site_pages` bumped on each content refresh; used to scope embeddings |
