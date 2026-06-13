# Image Strategy Spec

**Status:** Draft, written 2026-05-XX
**Author:** Thiago + Claude
**Depends on:** `multi-tenancy-spec.md` (tenant scoping); `duplicate-content-detection.md` (pattern reuse)
**Relates to:** Phase 2 Static Site Generator (where images get rendered into pages); Phase 3 Content Agent (where alt text is generated)

## Why this matters

Images are the second-biggest signal Google reads when deciding "is this a real local business or a doorway?" Get the strategy wrong and we leave SEO performance on the table; get it badly wrong and we trigger penalties.

Three failure modes the strategy must prevent:

1. **The same hero image on 200 pages.** Looks templated, signals doorway pattern, kills the entire brand.
2. **Generic stock-photo vibes.** Real local businesses use real photos; we need imagery that doesn't scream "downloaded from Shutterstock."
3. **Gerry as the bottleneck.** Master Plan assumed humans in the loop for image curation per brand. That doesn't scale and creates dependency on one person.

## Approach

Use **AI image generation APIs** to produce per-tenant-per-vertical image pools, then assign images to pages via rotation rules. Each tenant brings their own Flux API key — they own the bill, they own the images, no image is ever shared across tenants.

### Ownership model

- **Each tenant owns their own image pools.** Two tenants in the same vertical (e.g., LeadSquad and Localize both running painting brands) have two completely separate sets of generated images. No shared inventory.
- **Each tenant pays directly** by attaching their own Flux API account credentials in tenant settings.
- **Each tenant has their own image approver** — a designated tenant user who reviews generation batches before the images become available for page assignment. LeadSquad's approver is one of their partners; Localize's approver is Gerry (he's working with that team).
- **The platform owns the generation orchestration, scheduling, anti-clustering rules, and approval UI — not the imagery itself.**

### What the platform does automatically

- Triggers Flux generation jobs using the tenant's API key
- Stores results in tenant-scoped S3 paths: `s3://cl-images/{tenant-slug}/{vertical-slug}/{image-id}.webp`
- Assigns images to pages with anti-clustering rules (intra-tenant only)
- Generates per-page alt text via Claude at content time
- Re-generates pool quarterly (or on-demand via tenant Admin)
- Surfaces sample review to the tenant's designated approver after each batch

### What Gerry does (when assigned)

For Localize, where Gerry is the assigned approver:
- Reviews 10% sample of each newly-generated batch
- Flags any AI tells, off-brand imagery, or quality issues
- Cannot reassign or regenerate himself — approval-only role

For other tenants, the approver is a tenant user (LeadSquad has one of their partners as approver). Gerry has no involvement.

Gerry's broader platform role (brand logos, Figma page designs) is unchanged and orthogonal to this spec.

### v2 roadmap — per-brand pools

In v2 (post-launch, decided per tenant), image generation moves from per-vertical to **per-brand**. When a brand is spun up, the wizard triggers a brand-specific generation batch (say, 30-50 images per brand instead of pulling from the vertical-wide pool of 200). This further reduces image overlap within a tenant and lets each brand have its own visual identity.

v1 = tenant-vertical pools, v2 = tenant-brand pools.

## Provider — Black Forest Labs Flux

Decision: **Flux** for v1.

| Provider | Cost / image | Quality | Notes |
|---|---|---|---|
| **Flux 1.1 [pro]** | $0.040 | Highest realism | Overkill for our use |
| **Flux 1.1 [pro] ultra** | $0.060 | 4MP output | Overkill |
| **Flux [schnell]** | $0.003 | Good realism for the price | **Chosen for v1** |
| Stability AI SDXL | $0.002 | Slight AI tells visible | Backup option |
| OpenAI DALL-E 3 | $0.040 | Best quality | Too expensive at our scale |
| Google Imagen 3 | $0.030 | Comparable to Flux | Adds Google account dep |

Why Flux schnell:
- 4× faster than DALL-E 3
- Lower hallucination rate on local-business scenes (painters, HVAC techs, etc.)
- Cheap enough to regenerate pools quarterly without thinking about cost
- Available via Replicate or direct API

### Each tenant brings their own Flux API key

Tenant settings UI has a "Providers" section where the tenant Admin enters their Flux API key. The key is stored in **AWS Secrets Manager under a per-tenant entry**:

- Secret name: `cl-tenant-{tenant-slug}-providers`
- Format: JSON `{"flux_api_key": "...", "future_other_keys": "..."}`
- The tenant entry's `settings.providers.flux_secret_arn` stores the ARN reference, NOT the key itself

When the image generation worker runs for a tenant, it:
1. Reads the tenant's `flux_secret_arn` from `tenants.settings`
2. Fetches the key from Secrets Manager at job start
3. Uses it for Flux API calls
4. Discards the key from memory at job end

If a tenant has not configured their Flux key, image generation jobs are blocked with a clear error in the admin UI: "Add your Flux API key in Settings → Providers to enable image generation."

### Future provider migration

If we eventually move to DALL-E 3 (better quality) or another provider, the tenant adds whichever provider's key to their Providers section. Settings JSON expands:

```jsonc
{
  "providers": {
    "flux_secret_arn": "arn:aws:secretsmanager:...:cl-tenant-leadsquad-providers",
    "preferred_image_provider": "flux"  // or "dalle3", "stability"
  }
}
```

This way each tenant picks their cost/quality tier independently.

## Data model

### Tables

```sql
-- A pool of images for one tenant × one vertical (v1 scope)
-- v2 will add brand_id to scope further per brand
CREATE TABLE tenant_image_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vertical_id UUID NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,
  brand_id UUID,                                          -- NULL in v1, populated in v2 for per-brand pools
  pool_name VARCHAR(100) NOT NULL,                        -- e.g., "leadsquad-painting-2026-q2"
  generation_batch_id UUID,                               -- groups images generated in one batch
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, vertical_id, pool_name)
);

ALTER TABLE tenant_image_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_image_pools_isolation ON tenant_image_pools FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Individual generated (or uploaded) images — TENANT-SCOPED
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES tenant_image_pools(id) ON DELETE CASCADE,
  vertical_id UUID NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL CHECK (source IN ('flux', 'stability', 'dalle', 'upload')),
  s3_key TEXT NOT NULL,                                   -- e.g., "leadsquad/painting/abc123.webp"
  cdn_url TEXT NOT NULL,                                  -- tenant-scoped signed CloudFront URL
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  format VARCHAR(10) NOT NULL DEFAULT 'webp',
  generation_prompt TEXT,                                 -- only set for AI-generated
  generation_seed BIGINT,                                 -- for reproducibility
  generation_model VARCHAR(64),                           -- "flux-schnell-1.1"
  generation_cost_usd NUMERIC(10,6),                      -- billed to tenant
  generation_metadata JSONB,                              -- provider response details
  status VARCHAR(20) NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'flagged', 'retired')),
  flagged_reason TEXT,
  approved_by_user_id UUID,                               -- tenant user who approved
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE images ENABLE ROW LEVEL SECURITY;
CREATE POLICY images_tenant_isolation ON images FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX idx_images_tenant_vertical_status ON images(tenant_id, vertical_id, status);

-- One image can be on many pages within ONE tenant; one page has many images
CREATE TABLE page_image_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_id UUID NOT NULL,                                  -- references site_pages.id
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
  role VARCHAR(20) NOT NULL CHECK (role IN ('hero', 'service', 'team', 'gallery', 'testimonial')),
  display_order SMALLINT NOT NULL DEFAULT 0,
  alt_text TEXT,                                          -- generated per page+image at content time
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, image_id)
);

ALTER TABLE page_image_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY page_image_assignments_tenant_isolation ON page_image_assignments FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE INDEX idx_page_image_assignments_page ON page_image_assignments(page_id);
CREATE INDEX idx_page_image_assignments_image ON page_image_assignments(image_id);

-- Tracks image generation jobs (cost, status) — tenant-scoped
CREATE TABLE image_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES tenant_image_pools(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'failed', 'awaiting_approval')),
  target_image_count INTEGER NOT NULL,
  actual_image_count INTEGER NOT NULL DEFAULT 0,
  approved_image_count INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,        -- billed to tenant
  cost_cap_usd NUMERIC(10,4) NOT NULL DEFAULT 20.00,      -- safeguard
  prompts_used JSONB,                                     -- array of prompts
  triggered_by_user_id UUID,                              -- tenant user who initiated
  approver_user_id UUID,                                  -- tenant user assigned to review
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE image_generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY image_generation_jobs_isolation ON image_generation_jobs FOR ALL TO app_tenant_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Notes on the schema

- **Every table here is tenant-scoped via RLS.** Cross-tenant queries are physically impossible.
- **`images.tenant_id` is denormalized** for fast filtering without joining through `tenant_image_pools`.
- **`page_image_assignments.image_id` uses `ON DELETE RESTRICT`** — you can't accidentally delete an image still assigned to pages. Forces retirement (set `status = retired`) instead.
- **`tenant_image_pools.brand_id` is NULL in v1** — populated in v2 when pools become per-brand instead of per-vertical-within-tenant.
- **`images.status` defaults to `pending_approval`** — newly generated images aren't available for assignment until the tenant's approver reviews.
- **S3 path includes tenant slug** — `s3://cl-images/leadsquad/painting/abc123.webp`. Easy to identify ownership at the storage layer; easy to delete a tenant's entire image inventory if needed.

## Generation pipeline

### Prompt strategy

Per-vertical prompts, designed to produce useful local-business imagery without being so specific that the AI generates identical outputs every time.

Example for painting vertical:

```
Base prompt template:
"Professional [verticalNoun] working on [scene], natural lighting, photorealistic,
 wide aspect ratio, no logos or text visible"

Scene library for painting (rotates):
- "interior wall of a modern American home"
- "exterior trim of a Victorian-style house"
- "kitchen cabinets in a bright kitchen"
- "ceiling of a residential living room"
- "front door of a colonial-style home"
- ... 30+ scenes total

Modifiers (rotate independently):
- weather/time: "morning sunlight", "overcast afternoon", "golden hour"
- demographic: "in their 30s", "in their 40s", "experienced professional"
- ethnicity/gender: rotate evenly (avoid representational skew)
- equipment: "with brush", "with roller", "with spray gun", "with ladder"
- color palette: rotate target wall colors
```

Each batch generation runs the prompt template through every combination of scene × modifier (within budget). For 200 images per vertical (v1 default), we sample ~200 combinations.

### Negative prompts (always applied)

```
"no text, no logos, no watermarks, no brand names, no recognizable people,
 no copyrighted characters, no NSFW content, no children, no weapons,
 no AI-generation artifacts, no extra fingers"
```

### Job flow

```
Tenant Admin (or designated user) triggers "Generate pool" for a vertical
  → app fetches the tenant's Flux API key from Secrets Manager
  → creates image_generation_jobs row (status=queued, tenant_id=current)
  → worker dequeues, calls Flux API with tenant's key (parallel + rate-limited)
  → each successful image:
      • downloaded to local temp
      • converted to WebP, max 200KB
      • uploaded to S3 under {tenant-slug}/{vertical-slug}/[uuid].webp
      • images row inserted (status=pending_approval)
      • cost added to job total (billed to tenant's Flux account directly)
  → on completion, job status=awaiting_approval
  → assigned approver notified (in-app + email)
  → approver reviews 10% sample; bulk-approve, flag, or reject
  → approved images flip to status=active and become available for page assignment
```

### Generation cadence

- **New vertical for a tenant:** initial batch of 200 images
- **Quarterly refresh:** 100 new images appended; oldest 100 retired (status=retired, NOT deleted — still referenced by historical pages)
- **On-demand:** tenant Admin can trigger a refresh from the tenant admin panel
- **Cost cap:** $20 per generation job by default; tenant Admin can override per-job via typed confirmation; max global cap settable in tenant settings

## Page assignment rules

When a page is rendered (Phase 2 Static Site Generator), it gets 2-4 images:

| Role | Count per page | Selection rule |
|---|---|---|
| `hero` | 1 | Required. Top of page. |
| `service` | 1-2 | Mid-page, illustrating the service in action |
| `team` | 0-1 | Optional. "Background-checked professionals" trust block. |
| `gallery` | 0-2 | Footer area. Optional gallery strip. |

### Anti-clustering rules (intra-tenant)

All anti-clustering rules apply WITHIN a tenant's pool. Cross-tenant isn't a concern because pools are tenant-private.

1. **No image appears on more than `(pool_size / 10)` pages per brand.** With a 200-image pool, no image used more than 20 times per brand.
2. **No two pages in the same state with adjacent ZIP codes share a hero image.** Geographic dispersion within the tenant.
3. **Hero rotation:** the tenant's image pool is shuffled per brand at first render; subsequent pages walk the shuffled order. Ensures Brand A's "painting-hero-01.webp" appears on different pages than Brand B's within the same tenant.
4. **Role consistency:** an image flagged as 'hero' material doesn't get assigned as a 'team' image (avoids weird repeats).

### Assignment algorithm (pseudocode)

```
For each page being rendered:
  vertical = page.brand.vertical
  pool = active_images(vertical)
  shuffle_seed = hash(brand.id)  // deterministic per brand
  shuffled = pool.shuffle(seed=shuffle_seed)
  
  hero = pick_least_used_for_brand(shuffled, role='hero')
  service_1 = pick_least_used_for_brand(shuffled, role='service', excluding=[hero])
  service_2 = pick_least_used_for_brand(shuffled, role='service', excluding=[hero, service_1])  // optional
  
  for img in [hero, service_1, service_2]:
    if img == None: continue
    INSERT page_image_assignments (page_id=page, image_id=img, role=img.role)
```

### Per-page alt text generation

Alt text is **generated by Claude at content time**, NOT preassigned to images.

For each `page_image_assignments` row, the Content Agent gets:
- The image (via signed S3 URL for vision)
- The page context (city, service, brand)
- A prompt: "Describe this image in 8-15 words, mentioning [city] and [service] naturally, in a way that helps someone with a screen reader and helps SEO."

Output stored in `page_image_assignments.alt_text`. Per-page unique alt text is what Google actually reads — the underlying image being shared across pages matters MUCH less than each page having tailored alt.

## File specs

Every generated image:
- Format: **WebP**
- Max size: **200KB** (re-encode if larger)
- Hero dimensions: **1920×1080** (16:9)
- Service dimensions: **1200×800** (3:2)
- Team dimensions: **800×800** (1:1)
- Gallery dimensions: **1200×800** (3:2)
- Responsive srcset auto-generated at render time: `1x`, `1.5x`, `2x` variants

All served via CloudFront. **Never hotlinked from anywhere external.**

## Quality controls

### Auto-flags (no human needed)

- Image fails byte-size limit after WebP conversion → discard
- Image fails dimension check → discard
- Provider returned error → retry once, then discard
- NSFW detection (Flux returns a safety score) → discard if above threshold

### Per-tenant approval workflow

After every generation batch:

1. Job status flips to `awaiting_approval`
2. Notification fires to the **tenant's designated approver** (LeadSquad: one of their partners; Localize: Gerry; default if unset: the tenant Admin)
3. Approver visits `{tenant-slug}.continueleads.com/images/review/{job-id}` to see a 10% random sample
4. Per-image actions: Approve all-in-batch | Approve sample-shown | Flag specific images | Reject batch
5. Approved images flip to `status=active` and become available for page assignment
6. Flagged images stay `status=flagged` (in the DB for audit, not used in assignment)
7. Rejected batches: entire batch retired; cost is already incurred (paid via tenant's Flux account) — flagged to consider switching prompts/provider

### Approver assignment

Stored in tenant settings:

```jsonc
{
  "images": {
    "approver_user_id": "uuid-of-tenant-user",
    "auto_approve_threshold": null    // future: auto-approve if Flux quality score > X
  }
}
```

If `approver_user_id` is unset, the first tenant Admin user is used by default. Tenants can change this in settings.

### Per-image manual flag (any time)

Beyond batch review, any tenant user with the Admin or Ops role can flag an individual image at any time:
- "This image is bad" → `status=flagged`, removed from future assignment
- Pages currently using the flagged image continue to display it until the next regeneration cycle reassigns them

## Cost model

### Per-tenant — every tenant pays their own way

Each tenant attaches their own Flux account to the platform. Image generation costs are billed directly by Flux to the tenant. The platform never fronts the cost.

### Per-pool cost (initial generation)

- 200 images × $0.003 (Flux schnell) = **$0.60 per pool**

### Annual per-tenant cost

| Tenant's vertical count | Initial pools | Quarterly refresh (100 imgs each) | Annual cost |
|---|---|---|---|
| 1 vertical | $0.60 | $0.30 × 4 | **$1.80** |
| 5 verticals | $3.00 | $1.50 × 4 | **$9.00** |
| 60 verticals (Master Plan target) | $36 | $18 × 4 | **$108/year** |

For LeadSquad with painting + HVAC + plumbing + roofing (4 verticals): roughly **$7.20/year** in image costs.

For Localize at similar scale: same range.

### Platform-incurred costs (Continue Leads pays)

- **S3 storage**: 100KB avg × image count. At 100K platform-wide images: 10GB = $0.23/month = **$3/year platform-wide**
- **CloudFront egress**: minimal in v1 (staging only). Production traffic will scale this; included in standard CloudFront billing.

### Cost guardrails

- Every generation job has a default cap ($20 USD per job)
- Tenant Admin can adjust per-tenant cap in settings (must be confirmed via typed amount)
- `api_usage` table gets rows for image generation calls (provider=flux, cost_billed_to=tenant_id)
- Tenant cost dashboard groups image costs separately from text generation
- If Flux returns "insufficient credits" or auth failures, the generation job fails cleanly and the tenant Admin sees a clear "Update your Flux account" message in the admin UI

### v2 — Per-brand pools (cost implications)

When v2 ships, each brand gets its own pool generated at brand creation. Per brand: ~30-50 images = $0.09-$0.15 per brand. For a tenant with 25 brands: ~$2-3 per year, plus quarterly refreshes. Comparable to v1 at small scale, slightly more at large scale, but with the benefit of zero image overlap between brands within a tenant.

## Implementation tasks (atomic)

### IMG-1 — Schema migration (60 min)
- `tenant_image_pools`, `images`, `page_image_assignments`, `image_generation_jobs`
- RLS on all four tables (per multi-tenancy spec)
- Indexes
- `brand_id` column on `tenant_image_pools` (NULL in v1, ready for v2)

### IMG-2 — Per-tenant Flux key handling (60 min)
- Tenant settings UI: "Providers" section with Flux API key input
- Key stored in per-tenant Secrets Manager entry (`cl-tenant-{slug}-providers`)
- Retrieval helper that fetches the key just-in-time during job execution
- `apps/admin/src/lib/flux.ts` — wrapper for Flux API with retry + rate limiting
- WebP conversion + byte-size enforcement
- S3 upload helper with tenant-scoped path
- Cost tracking in `api_usage` table (provider=flux, cost_billed_to=tenant_id)

### IMG-3 — Prompt library for first vertical (45 min)
- Define scenes, modifiers, negative prompts for painting
- Document the format so adding HVAC etc. is repeatable

### IMG-4 — Batch generation worker (90 min)
- Job worker that consumes `image_generation_jobs` queue
- Parallelized API calls with rate limit
- Cost rollup
- Quality auto-flags

### IMG-5 — Page assignment algorithm (60 min)
- Implement the deterministic assignment function
- Anti-clustering rules
- Test: generate 200 pages for a brand, verify rotation distribution

### IMG-6 — Alt text generation hook (30 min)
- Content Agent (Phase 3) calls Claude vision with image + context
- Stores result in `page_image_assignments.alt_text`

### IMG-7 — Per-tenant approval UI (75 min)
- `{tenant-slug}.continueleads.com/images/review/{job-id}` — tenant-scoped approval view
- Shows 10% random sample post-batch
- Bulk-approve, sample-only-approve, flag-specific, or reject-batch actions
- Notification fires to assigned approver on batch completion (in-app + email)
- Approver assignment configurable in tenant settings

### IMG-8 — Tenant image management UI (60 min)
- Tenant admin can browse their own pool
- Flag individual images for retirement
- View per-image usage stats (which pages use it)
- Trigger a pool refresh manually

### IMG-9 (future) — CLIP-based image similarity detection (deferred)
- Embed every image via CLIP
- Same pgvector pattern as text duplicate detection
- Only build if Google complaints surface

**Total estimate:** ~7-8 hours of focused work for v1 (IMG-1 through IMG-8).

## Tenant isolation

Every aspect of imagery is tenant-scoped from day one:

- **Image POOLS are tenant-scoped.** Tenant A's painting pool ≠ Tenant B's painting pool, even though they're in the same vertical. Two completely separate sets of generated imagery.
- **Image generation costs are tenant-paid via the tenant's own Flux account.** Platform doesn't front the bill.
- **Image FILES live in tenant-scoped S3 prefixes** (`s3://cl-images/{tenant-slug}/...`). Easy ownership identification, easy bulk delete on tenant offboarding.
- **CloudFront URLs include the tenant slug** so URL inspection makes ownership obvious.
- **RLS protects every related table** — pools, images, assignments, generation jobs.
- **No image, no prompt, no generation history is ever visible across tenants.**

This means: even if LeadSquad and Localize both run painting brands, their imagery never overlaps. No "Hey, didn't I see this image on someone else's site?" risk.

## What this protects against

- The "same hero image on 200 pages" doorway signal — rotation rules force dispersion
- Stock-photo-vibes — Flux-generated imagery looks more candid than stock libraries
- Gerry-as-bottleneck — routine generation runs without him
- Alt-text duplication — per-page unique alt text is what Google actually parses

## What this doesn't address (deferred / out of scope)

- **Cross-brand image overlap within a tenant** — within a tenant, two brands draw from the same per-vertical pool and may share images. Acceptable risk for v1 because alt text and surrounding content differ; mitigated by anti-clustering rules. **Fully solved in v2** when pools move from per-tenant-per-vertical to per-tenant-per-brand.
- **Image similarity detection** — CLIP embeddings + pgvector. Defer until proven necessary; would slot in only if Google ever penalizes the overlap.
- **AI-generated video** — emerging capability; not relevant to v1.
- **Hero variation per page section** — e.g., different image when user scrolls. Not relevant to v1.
- **Bring-your-own-image uploads at scale** — Manual upload is supported via `source='upload'` for one-offs (custom team photos, etc.), but bulk imagery upload isn't a v1 feature.

## Decisions locked (2026-05-XX)

1. **Provider:** Flux schnell for v1. DALL-E 3 considered as a future upgrade if quality demands it.
2. **Pool size per tenant per vertical:** **200 images.** Refresh quarterly (100 new, 100 retired).
3. **Account ownership:** **Each tenant brings their own Flux account.** The platform never fronts image generation costs.
4. **Approval workflow:** **Automatic generation with required tenant-level approval before images become usable.** Each tenant designates an approver:
   - **LeadSquad:** one of their partners
   - **Localize:** Gerry
   - **Default for new tenants:** first tenant Admin
5. **People in imagery:** Yes, but **wide shots only** — facial detail isn't important, avoids uncanny face artifacts.
6. **Same-vertical brands across tenants:** **Never share an image.** Per-tenant pools guarantee this.
7. **v2 — per-brand pools:** Generate per-brand pools when a brand is spun up (~30-50 images per brand instead of pulling from vertical pool). Eliminates intra-tenant cross-brand overlap entirely.

## Open implementation questions (handle during build)

1. **Tenant's first time configuring Flux.** Onboarding flow needs to walk the tenant Admin through: "Sign up for Flux at [link], generate an API key, paste it here." Could be a one-time setup wizard or a permanent step in tenant settings.
2. **Cost reporting back to tenant.** Flux bills tenant directly, but the platform also tracks `total_cost_usd` for each job. Tenant cost dashboard should reconcile: "We tracked $4.20 in generation cost this month; you'll see this on your Flux bill." Discrepancies (e.g., Flux pricing changes) need to surface clearly.
3. **Prompt tuning ownership.** Initially handled by Thiago + the platform; later, tenants may want their own prompt customization per vertical for brand differentiation. Plan: prompt files versioned in `docs/prompts/image-generation/[vertical].md` for v1; tenant-overridable prompts in v2.
4. **Approver delegation during PTO.** If the LeadSquad approver is on vacation and a batch needs approval, the tenant Admin should be able to reassign approver per-job. Build into the approval UI.
5. **Auto-approve after timeout.** Some tenants may want batches to auto-approve after N days of no review. Make configurable in tenant settings, default off.

## Glossary

| Term | Meaning |
|---|---|
| Pool | A versioned set of images for one vertical |
| Hero | The main top-of-page image |
| Anti-clustering | Rules that prevent the same image showing up on too many pages within a brand |
| Flux | Black Forest Labs' image generation model — chosen for cost/quality |
| WebP | Modern image format with better compression than JPEG; required for all platform imagery |
| Per-page alt text | Image description unique to each page that displays the image; what Google actually parses |
