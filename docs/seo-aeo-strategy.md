# SEO / AEO Strategy

**Status:** Draft, written 2026-05-XX
**Author:** Thiago + Claude
**Depends on:** `multi-tenancy-spec.md`, `image-strategy.md`, `duplicate-content-detection.md`
**Affects:** Phase 2 (Static Site Generator), Phase 3 (Content Agent), Phase 4 (QA Agent)

## Why this exists

The original Master Plan covered SEO basics (schema, canonicals, sitemaps) but didn't lay out the full system: how on-page elements compose with sitewide structure, how content layers (money + city + service + blog + FAQ) reinforce each other, how AEO requirements integrate with traditional SEO, and how all of this composes at scale across hundreds of pages per brand.

This doc owns the complete strategy. When we build Phase 2/3/4 we work from this, not from invention.

### A note on AEO

AEO (AI Engine Optimization) gets treated as separate from SEO. It isn't. AEO is well-done SEO with three additional emphases:

1. **Answer-first content structure** — AI engines lift the FIRST clear answer they find on a topic
2. **Citation-friendly authoritativeness markers** — clear authorship, dates, sources make pages quotable
3. **Structured data that AI parsers prefer** — FAQ schema, HowTo, organization markup

Everything in this doc serves both. The differences are emphasis, not architecture.

### What lead-gen-front context changes

The brands we generate are not real businesses. They're marketing fronts that capture leads. This is a legitimate business model (Angi, HomeAdvisor, Modernize all operate variants) but it constrains some SEO levers:

- No real physical address → schema markup is `ServiceAreaBusiness`, not `LocalBusiness` with `streetAddress`
- No real Google Business Profile → no GBP integration, no review aggregation from Google
- No real reviews (option C from the duplicate-content discussion) → trust signals come from other elements
- Off-page SEO (citations, backlinks, directory submissions) is OUT OF SCOPE for v1

These constraints shape what we DO put on pages — every choice maximizes within the model.

## The on-page kit (per money page)

Every money page that goes live must include every element below. This is the floor — pages without these are not eligible to flip to `indexable`.

### Required SEO elements

| # | Element | Specification |
|---|---|---|
| 1 | **Title tag** | `{Service} in {City}, {State} \| {Brand Name}` — 50-60 chars, AI-generated final form per page |
| 2 | **Meta description** | 150-160 chars, unique per page, includes city + service + call-to-action, AI-generated |
| 3 | **H1** | Echoes title formula but conversational: "Looking for {Service} in {City}?" |
| 4 | **URL** | `/{city-slug}-{state-code}/{service-slug}` — already implemented; never changes after publish |
| 5 | **Canonical URL** | Self-canonical, matches the page's own URL |
| 6 | **Open Graph tags** | og:title, og:description, og:image (uses hero image from `page_image_assignments`), og:type=website |
| 7 | **Twitter Card tags** | summary_large_image, mirrors OG content |
| 8 | **Schema markup** | `ServiceAreaBusiness` + `FAQPage` (for H2 Q&A block) + `BreadcrumbList` — all JSON-LD in `<script>` tags |
| 9 | **`<link rel="alternate">`** | hreflang="en-US"; explicit even though we're English-US only — clarifies for search engines |
| 10 | **Viewport meta** | `<meta name="viewport" content="width=device-width, initial-scale=1">` |
| 11 | **Robots meta** | `noindex` by default; flipped to `index, follow` only after QA + manual sign-off (see Phase 4 spec) |

### Required AEO elements

| # | Element | Specification |
|---|---|---|
| 12 | **Answer-first hero paragraph** | First paragraph below H1 must directly answer the implicit query: "Looking for {service} in {city}? We connect you with vetted local {vertical} pros — free estimates, same-day quotes available." |
| 13 | **Question-based H2/H3 structure** | At least 4 H2s, each a question users actually ask. Examples for painting: "How much does interior painting cost in {city}?", "How long does an exterior paint job take?", "Are your painters licensed and insured?", "What areas of {city} do you serve?" |
| 14 | **First-paragraph-after-H2 answers** | Each H2's first paragraph is a direct answer. AI engines crawl Q→A pairs; this format wins citation. |
| 15 | **Listed/numbered key facts** | At least one ordered list per page with concrete numbers (cost ranges, timing estimates, service categories) — AI engines extract list data preferentially |
| 16 | **"Last updated" timestamp** | Visible to users (footer or near title) AND reflected in schema `dateModified`. Pages refreshed annually per the content refresh cycle. |
| 17 | **Author/publisher attribution** | Page footer shows publisher (the brand name) and "Published: {date}" / "Last reviewed: {date}". Adds E-E-A-T signal. |

### Content structure (mandatory per page)

| # | Element | Specification |
|---|---|---|
| 18 | **Hero block** | Above-the-fold: H1, answer-first paragraph, primary CTA button, click-to-call phone link (tracked via DNI eventually). Mobile-first sizing. |
| 19 | **Body content** | Target **1,000-1,500 words**, AI-generated, city-and-service-specific. Boilerplate language must vary per page (no "We are the best painters in {city}!" templates). |
| 20 | **Trust block** | Standard trust signal kit (see Trust Signals section below) |
| 21 | **Service-area visualization** | Lightweight (CSS-only) map or list of neighborhoods/zip codes covered. NOT Google Maps embed (slow, third-party dep). |
| 22 | **Internal linking** | 3-5 links to related cities (same service), 3-5 links to related services (same city). See Internal Linking section below. |
| 23 | **Image strategy** | 2-4 images: 1 hero + 1-2 service + 0-1 team. Per `image-strategy.md`. Each with unique alt text generated per page. Image sitemap entry per page. |
| 24 | **Lead capture form** | TCPA consent above submit button (mandatory — see TCPA section). Honeypot field. Rate-limited. POST to `/api/leads/capture`. |
| 25 | **Secondary CTA at page bottom** | "Get a free estimate" form repeat OR phone CTA. Users who scroll past should still convert. |
| 26 | **Footer** | Brand name, phone, service area summary, privacy policy link, terms link, TCPA disclosure link |

### Page performance

| # | Element | Specification |
|---|---|---|
| 27 | **WebP images** | Per image strategy spec. Lazy-loaded (`loading="lazy"`). |
| 28 | **CSS** | Inline critical CSS for above-the-fold; deferred CSS for rest. Tailwind purged. |
| 29 | **JavaScript** | Minimal. No analytics blocking render. No third-party JS except GA4 (deferred) and form handler. |
| 30 | **Core Web Vitals** | LCP < 2.5s, FID < 100ms, CLS < 0.1 — measured at QA time, blocks `indexable` if failing |
| 31 | **Page weight** | Target < 1.5MB total page weight (images included) |
| 32 | **Server response** | Static HTML from S3 + CloudFront. TTFB < 200ms p95. |

### Analytics & verification

| # | Element | Specification |
|---|---|---|
| 33 | **GA4 tag** | Injected via Static Site Generator at render time, per-brand Measurement ID. Loaded async, doesn't block render. |
| 34 | **Google Search Console verification** | Verification meta tag per brand, injected at render. Sitemap submitted via GSC API on indexing flip. |
| 35 | **UTM parameter passthrough** | Form submissions preserve UTM params from page load → attribute lead source correctly. Built into capture endpoint. |
| 36 | **Conversion tracking** | GA4 event on form submit; pixel/event on phone click (eventually call tracking integration in Phase 5/6) |

## Sitewide elements (per brand)

These live at the brand-domain level, not per-page.

### Required

| Element | Specification |
|---|---|
| **`sitemap.xml`** | Auto-generated, only includes pages with `indexing_mode='indexable'`. Updated on every flip. Submitted to GSC via API. Per-page entries include `<lastmod>` and `<priority>`. |
| **`sitemap-images.xml`** | Separate image sitemap referencing all images used across the brand's indexable pages. Helps image search. |
| **`sitemap-blog.xml`** | Separate sitemap for blog posts (Phase 3+). High `<changefreq>` since blog is updated regularly. |
| **`robots.txt`** | `Disallow: /` until go-live; `Allow: /` + sitemap reference on flip. AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) explicitly allowed by default; tenant can override. |
| **`llms.txt`** | Emerging AEO standard. Declares site purpose, primary content paths, contact info for AI engines. Format: simple Markdown at root. Example at end of doc. |
| **404 page** | Custom, with site search and recent pages. Returns proper 404 status. |
| **Favicon** | Brand-customizable. Multiple sizes via `<link rel="icon">` at standard resolutions. |
| **Open Graph default image** | Brand-level fallback image for any page that doesn't have one |

### Sitewide schema markup

In addition to per-page schema:

- `WebSite` schema at root with `SearchAction` (declares the site has search; helps Google show sitelink search box)
- `Organization` schema at root identifying the brand publisher (NOT a `LocalBusiness` since these are lead-gen brands without physical address)
- `BreadcrumbList` per page (already in per-page kit)

## Content layers

The site is more than just money pages. Each layer reinforces SEO and gives AI engines more to cite.

### Layer 1 — HOME page

- Brand hero, value prop, top 3 service highlights
- Service area summary (cities served)
- Call-to-action: "Get a free estimate"
- Internal links to all SERVICE pages and the top 5 CITY pages by population
- Schema: `Organization` + `WebSite`

### Layer 2 — SERVICE pages

One per service offered (e.g., `/services/interior-painting`). Acts as the SERVICE hub:

- What is this service, when do you need it, what's included
- Links to all CITY × this-service money pages
- FAQ section specific to the service
- Trust signals
- Schema: `Service` schema markup

### Layer 3 — CITY pages

One per target city (e.g., `/boston-ma`). Acts as the CITY hub:

- Overview of services offered in this city
- Links to all this-city × SERVICE money pages
- Neighborhood-level detail if available
- Local trust signals ("Serving {city} since {year}" — use brand's launch date if no longer-term claim is defensible)
- Schema: `Place` + `ServiceAreaBusiness` with `areaServed` scoped to this city

### Layer 4 — MONEY pages

The bulk of indexable surface. City × service combinations. Already covered above.

### Layer 5 — LEGAL pages

- `/privacy-policy` — required for any data capture
- `/terms-of-service`
- `/contact` — phone, email forwarder, contact form (form distinct from lead capture)
- `/tcpa-disclosure` — full TCPA consent language
- `/accessibility` — basic statement
- `/about` — brand story (AI-generated, vague-but-positive, careful not to make claims about specific physical operations)

All `noindex` by default (legal pages don't need to rank), `index` only if a tenant wants them in search results.

### Layer 6 — FAQ pages

Centralized FAQ at `/faq` aggregating common questions across services. Cross-links into specific service H2 Q&As. Schema: `FAQPage`.

### Layer 7 — Blog (NEW from Master Plan)

This was missing from the original Master Plan but is central to modern SEO + AEO. Detailed in its own section below.

### Layer 8 — "Best of" pages (future, Phase 3+)

E.g., `/best-painters-in-boston-2026`. Comparison-style content that targets high-intent informational queries. v2 feature.

## Blog system

Cadence: **2-4 posts per week per brand**. AI-only generation initially (per the locked decision); future per-brand toggle to AI / hybrid / human-only.

### Topic generation

Topic queue maintained per vertical, mixing:

- **Evergreen** (60%): "How to choose a painter," "Signs your HVAC needs replacement," etc.
- **Seasonal** (25%): "Best time to paint exterior in New England" (timed for spring posts in Boston)
- **Local news / events** (15%): "How {city}'s recent weather affects your home's exterior" — auto-generated from weather data + city info

Topic queue stored in `blog_topic_queue` table. Topics get assigned to specific brands based on tenant + brand + vertical match.

### Per-post structure

- 800-1,500 words (similar to money page)
- Required: H1 (post title), 4+ H2 questions, last-updated timestamp, author attribution (use tenant-level author persona, e.g., "The {Brand} Team")
- Required: schema `Article` + `BreadcrumbList`
- Linking: every blog post links to at least 2 city pages and 2 service pages (drives crawl depth + relevance signals)
- Featured image: from tenant's image pool, same anti-clustering rules

### Refresh cycle for blogs

Different from money pages — blogs are time-sensitive content.

- Posts older than 18 months: auto-flagged for refresh
- Refresh = regenerate body with updated date, preserve URL + slug + canonical
- Trending/seasonal posts can be refreshed more aggressively

### Blog URL structure

- Per-brand: `https://{brand-domain}/blog/{slug}`
- Slug derived from title, max 60 chars
- Category subpages: `/blog/category/{category-slug}` (e.g., painting-tips, hvac-maintenance)

### Tenant control over blog

Stored in `tenants.settings.blog`:

```jsonc
{
  "blog": {
    "enabled": true,
    "posts_per_week_per_brand": 3,
    "content_mode": "ai-only",       // "ai-only" | "hybrid" | "human-only"
    "publish_workflow": "auto",      // "auto" | "review_required"
    "tone": "friendly_professional", // tenant brand voice
    "topic_focus": ["evergreen", "seasonal", "local"]
  }
}
```

## Internal linking strategy

Internal links are 60% of SEO and 80% of how AI engines understand site structure.

### Hub-and-spoke architecture

- **HOME** is the master hub. Links to every SERVICE page. Links to top CITY pages.
- **Each SERVICE page** links to all CITY × this-service money pages.
- **Each CITY page** links to all this-city × SERVICE money pages.
- **Each MONEY page** links back to its parent SERVICE page and CITY page, plus to "related" pages (3-5 nearby cities, 3-5 related services).
- **Blog posts** link into at least 2 city + 2 service pages.

### Related-pages algorithm

For a given MONEY page (`{city}` × `{service}`):

- **Related cities**: pick 3-5 cities in same state, ranked by population proximity (within 2x population, prefer same county)
- **Related services**: pick 3-5 services in same vertical with high topical overlap (e.g., from "interior painting" → "exterior painting", "cabinet refinishing", "wallpaper removal")

Stored as cached relationships in the page data, not computed on every render.

### Footer link maps

Every page footer includes a rotating link map: 15-20 high-priority pages (mix of cities + services). Rotation is brand-deterministic (same brand always shows same footer set, prevents random-feel) but varies per page to maximize unique crawl paths.

### Breadcrumbs

Every page (except HOME) shows breadcrumbs at the top, with `BreadcrumbList` schema:

- MONEY: `Home > {Service} > {City}` (e.g., `Home > Interior Painting > Boston`)
- CITY: `Home > {City}`
- SERVICE: `Home > {Service}`
- Blog post: `Home > Blog > {Category} > {Post Title}`
- FAQ: `Home > Help > FAQ`

## Title / meta formulas

### Title tag formulas per page type

| Page type | Formula | Example |
|---|---|---|
| HOME | `{Brand Name} — {Vertical} in {Primary Service Area}` | `Boston Painters Inc — Painting Services in Greater Boston` |
| SERVICE | `{Service} \| {Brand Name}` | `Interior Painting \| Boston Painters Inc` |
| CITY | `{Vertical} in {City}, {State} \| {Brand Name}` | `Painting in Cambridge, MA \| Boston Painters Inc` |
| MONEY | `{Service} in {City}, {State} \| {Brand Name}` | `Exterior Painting in Newton, MA \| Boston Painters Inc` |
| Blog post | `{Post Title} \| {Brand Name}` | `When to Paint Your Home's Exterior in New England \| Boston Painters Inc` |
| FAQ | `Frequently Asked Questions \| {Brand Name}` | `Frequently Asked Questions \| Boston Painters Inc` |

### Meta description formulas

| Page type | Approach |
|---|---|
| HOME | Brand + value prop + service area, ~150 chars |
| SERVICE | Service description + city coverage + CTA, ~155 chars |
| CITY | All services + city, ~155 chars |
| MONEY | "Looking for {service} in {city}? Free estimates from licensed pros. Same-day quotes." + service-specific, ~155 chars |
| Blog post | Post first paragraph trimmed to ~155 chars |

Meta descriptions are **generated by Claude per page** — not templated — so each one is genuinely unique.

## Schema markup library

All schema in JSON-LD inline `<script type="application/ld+json">`. Common patterns documented here, full templates in `apps/admin/src/lib/schema/`.

### `ServiceAreaBusiness` (every MONEY + CITY page)

```jsonc
{
  "@context": "https://schema.org",
  "@type": "ServiceAreaBusiness",
  "name": "{Brand Name}",
  "telephone": "{Brand Phone}",
  "url": "https://{brand-domain}",
  "areaServed": {
    "@type": "City",
    "name": "{City}",
    "containedInPlace": { "@type": "State", "name": "{State}" }
  },
  "serviceType": "{Service}",
  "priceRange": "$$"
}
```

### `FAQPage` (every MONEY page, FAQ pages)

```jsonc
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{H2 question}",
      "acceptedAnswer": { "@type": "Answer", "text": "{first paragraph after H2}" }
    },
    // ...one per H2 Q&A pair
  ]
}
```

### `BreadcrumbList` (every page except HOME)

```jsonc
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://{brand-domain}/" },
    { "@type": "ListItem", "position": 2, "name": "{Service}", "item": "https://{brand-domain}/services/{service-slug}" },
    { "@type": "ListItem", "position": 3, "name": "{City}", "item": "https://{brand-domain}/{city-slug}-{state}/{service-slug}" }
  ]
}
```

### `Article` (blog posts)

```jsonc
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{post title}",
  "datePublished": "{ISO date}",
  "dateModified": "{ISO date}",
  "author": { "@type": "Organization", "name": "{Brand Name}" },
  "publisher": { "@type": "Organization", "name": "{Brand Name}" },
  "image": "{hero image URL}"
}
```

### `Organization` (HOME)

```jsonc
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "{Brand Name}",
  "url": "https://{brand-domain}",
  "logo": "{brand logo URL}",
  "telephone": "{brand phone}"
}
```

Schema validation runs in QA Agent — every page checked against schema.org spec before flipping to `indexable`.

## Trust signals (the standard kit)

Per the locked decision (Option C from duplicate-content discussion). Every MONEY page includes:

1. **5-star visual** with framing: `⭐⭐⭐⭐⭐ Quality Service Guaranteed` (decorative, not a rating claim — defensible because the stars don't imply a customer-rating aggregate)
2. **"Background-checked Professionals"** badge (true — buyer pool is vetted by the lead-buying entities)
3. **"Licensed & Insured Contractors"** badge (true via buyer pool)
4. **"Free Estimates"** badge
5. **"Same-Day Quotes"** badge
6. **"24/7 Availability"** badge with click-to-call phone
7. **Service-area map / list** showing cities covered (lightweight CSS, not Google Maps)
8. **TCPA consent above submit** (regulatory requirement)
9. **Privacy policy link** in footer
10. **Visible phone number** prominently in hero

NO claims about:
- Years in business of the BRAND (the brand doesn't really exist; this would be misleading)
- Number of jobs completed (no real data)
- Specific contractor credentials displayed on page (since the brand isn't the contractor)
- Customer review counts ("847 reviews") — would imply a database that doesn't exist
- Awards or affiliations not actually held by the operating tenant

Trust signals can be TRUE about the operating tenant (LeadSquad has 5 years of lead-gen experience, etc.) but those would appear on the tenant's parent corporate site, not the lead-gen brand fronts.

## TCPA consent copy

Per the lead-gen-front model, consent must disclose lead resale to multiple parties.

### Draft language (placeholder until attorney-approved)

> By clicking "Get My Free Estimate," I consent to receive marketing communications including phone calls, text messages (SMS/MMS), and emails from {Brand Name} and our network of service partners regarding my project request, using automated technology. I understand that consent is not a condition of any purchase. Message and data rates may apply. Reply STOP to opt out. View our [Privacy Policy] and [TCPA Disclosure] for details.

### Placement requirements

- **Above the submit button** (never below, never in a separate page)
- **Default to UNCHECKED checkbox**? Or implied consent via "by clicking"? **Decision:** Use implied consent ("By clicking ... I consent") — checkboxes have higher legal risk if challenged (was the box pre-checked? did the user actually check it?). Implied-consent language with a "By clicking" button has stronger case law precedent.
- **Visible without scrolling** when the submit button is visible — viewport check during QA
- **Linked Privacy Policy** to `/privacy-policy`
- **Linked TCPA Disclosure** to `/tcpa-disclosure` (separate page with full legal copy)

### Customizable per tenant

`tenants.settings.tcpa_consent_text` allows per-tenant override (when their attorney has approved different language). Default uses the draft above.

### Critical: real lawyer review before launch

This is a placeholder. **Before any form goes live**, the language must be reviewed by an attorney familiar with TCPA and FTC consumer protection rules. Specifically the 2024 FTC rule on fake reviews/misleading practices and the 2023 FCC TCPA "one-to-one consent" requirement.

## Content refresh cycle

### When pages get refreshed

- **Money pages**: 12 months after content_generated_at (Master Plan default; configurable per tenant)
- **City/Service hub pages**: 18 months (less time-sensitive)
- **Blog posts**: 18 months
- **HOME / Legal**: only on explicit edit

### What refreshing does

For a money page:
1. Bump `content_version`
2. Trigger fresh content generation (Phase 3 Content Agent)
3. Trigger fresh embedding (per duplicate-content spec)
4. Update `last_updated` timestamp display + `dateModified` schema
5. Re-run QA
6. If duplicate-content check fails against current pages, escalate to review
7. URL stays the same; canonical stays the same; indexing status preserved

### What refreshing doesn't change

- URL slug
- Canonical
- Indexing mode
- Internal link graph (other pages still link to it)

## llms.txt format (AEO)

Root file `/llms.txt`. Plain Markdown. Tells AI crawlers what the site is and where the meaningful content is.

```markdown
# {Brand Name}

{Brand Name} connects homeowners in {service area} with vetted local {vertical} professionals. Free estimates, same-day quotes.

## Services

- [Interior Painting](/services/interior-painting)
- [Exterior Painting](/services/exterior-painting)
- ...

## Service Areas

- [Boston, MA](/boston-ma)
- [Cambridge, MA](/cambridge-ma)
- ...

## Resources

- [FAQ](/faq)
- [Blog](/blog)
- [Contact](/contact)
- [Privacy Policy](/privacy-policy)

## Contact

- Phone: {brand phone}
- Service area: {service area summary}
```

Generated automatically at render time per brand.

## QA checks specific to SEO

These slot into the QA Agent (Phase 4) on top of the duplicate-content and word-count checks.

Per-page checks (all must pass before `indexable` flip):

1. Title present and within 50-60 chars
2. Meta description present and within 140-165 chars
3. Single H1 (no missing, no duplicates)
4. At least 4 H2s, all phrased as questions
5. First paragraph after each H2 is at least 1 sentence (answer present)
6. At least one `<ol>` or `<ul>` in body
7. Canonical URL matches the page URL
8. Robots meta present and correct (`noindex` until QA pass, then `index, follow`)
9. ServiceAreaBusiness schema present and validates
10. FAQPage schema present and validates against H2 Q&A pairs
11. BreadcrumbList schema present and validates
12. At least 3 internal links to related cities, 3 to related services
13. At least 2 images present
14. Every `<img>` has alt text (not empty, not placeholder)
15. Hero image dimensions meet spec
16. WebP format for all images
17. TCPA consent text present and visible without scroll on form
18. Phone number present in hero and footer
19. Open Graph tags complete (og:title, og:description, og:image)
20. Twitter Card tags complete
21. Word count between 1,000-1,500
22. No more than 3 instances of any keyword (over-optimization check)
23. Last-updated timestamp present
24. Privacy policy link present in footer
25. Page weight < 1.5MB
26. LCP < 2.5s when rendered to staging
27. No console errors in browser when rendered

Sitewide checks (per brand, before any page indexes):

28. sitemap.xml validates and references all `indexable` pages
29. sitemap-images.xml validates
30. robots.txt allows crawl on go-live
31. llms.txt present
32. 404 page returns proper 404 status
33. HTTPS enforced sitewide
34. WWW redirects to non-www (or vice versa, per tenant settings) consistently

## Tenant-specific customization

Per `tenants.settings.seo`:

```jsonc
{
  "seo": {
    "default_tone": "friendly_professional",   // affects content prompts
    "primary_keyword_modifier": "best",         // "best painters in {city}" vs "top" vs "professional"
    "include_year_in_titles": false,            // "Painting in Boston 2026" vs without
    "schema_extras": {},                        // custom schema additions
    "robots_allow_ai_crawlers": true            // tenant can opt out of AI crawling
  }
}
```

Per-brand override exists for tone and phrasing (Brand A = "warm/casual", Brand B = "professional/authoritative") — drives Claude's content generation prompts.

## Implementation tasks (atomic)

### Foundation (Phase 2 prereqs)

- **SEO-1** — Page template generator with full kit (90 min): templates per page type that include all required elements
- **SEO-2** — Schema markup library (60 min): `apps/admin/src/lib/schema/` with builders for each schema type
- **SEO-3** — Internal linking algorithm (75 min): related-cities + related-services computation; cached per page
- **SEO-4** — Sitemap generation (60 min): main + images + blog sitemaps per brand; auto-update on indexable flips
- **SEO-5** — robots.txt + llms.txt per brand (45 min): auto-generated at render time

### On-page elements (Phase 2)

- **SEO-6** — Title/meta formula engine (45 min): per-page-type formulas with token interpolation
- **SEO-7** — Trust signal component library (60 min): the 10 trust elements as reusable React components
- **SEO-8** — TCPA consent component (30 min): placement-enforced, tenant-overridable
- **SEO-9** — Service area map component (45 min): lightweight CSS rendering, no third-party
- **SEO-10** — Lead capture form component (60 min): TCPA above submit, honeypot, rate-limit, analytics

### Analytics + verification (Phase 2)

- **SEO-11** — GA4 + GSC verification injection (60 min): per-brand IDs in tenant settings; injected at render
- **SEO-12** — UTM passthrough in form submissions (30 min)

### QA Agent checks (Phase 4)

- **SEO-13** — Per-page SEO checks (90 min): all 27 per-page validations
- **SEO-14** — Sitewide SEO checks (60 min): the 7 sitewide validations
- **SEO-15** — Core Web Vitals measurement (60 min): headless test, blocks indexing if failing

### Content refresh (Phase 3+)

- **SEO-16** — Refresh cycle cron (45 min): identifies pages over age, queues regeneration
- **SEO-17** — Last-updated timestamp tracking (30 min): visible to users, in schema dateModified

### Blog system (Phase 3)

- **SEO-18** — Blog schema migration (45 min): `blog_posts`, `blog_topic_queue`, `blog_categories`
- **SEO-19** — Blog content generation prompts (90 min): per-vertical templates, tenant tone application
- **SEO-20** — Blog publishing workflow (60 min): auto-publish vs review-required
- **SEO-21** — Blog topic queue scheduler (45 min): mixes evergreen/seasonal/local per cadence config
- **SEO-22** — Blog refresh cycle (30 min): 18-month refresh per post

### Tenant config (alongside multi-tenancy build)

- **SEO-23** — Tenant SEO settings UI (45 min): tone, keyword modifier, AI crawler opt-out
- **SEO-24** — Per-brand SEO override UI (30 min): brand-specific tone, voice

**Total estimate:** ~22-24 hours of focused work across SEO-1 through SEO-24. Roughly tracks Phase 2 (most) + Phase 3 (blog) + Phase 4 (QA).

## What this protects against

- Templated-content penalty (every page truly unique via word-count + duplicate detection + per-page schema variation)
- Missing critical SEO elements (QA gate blocks pages without them)
- Bad trust signals (legally-defensible kit only)
- Slow pages (Core Web Vitals checked in QA)
- Lost attribution (UTM passthrough built-in)
- AEO blindness (Q&A structure + answer-first paragraphs + llms.txt)
- Content drift over time (refresh cycle + visible timestamps)

## What's out of scope (per locked decisions)

- **Off-page SEO** — directory submissions, backlinks, GBP. Per the multi-tenancy strategy doc.
- **Real reviews** — option A from the trust-signal discussion. Five-star decorative only.
- **GBP integration** — no real business profiles to manage.
- **NAP consistency tooling** — no real "A" (address); brands are service-area only.
- **International SEO** — English-US only.
- **Voice/style fingerprinting** — per the duplicate-content discussion.

## Glossary

| Term | Meaning |
|---|---|
| **AEO** | AI Engine Optimization — making content findable and citation-worthy for AI engines |
| **E-E-A-T** | Google's "Experience, Expertise, Authoritativeness, Trustworthiness" — quality signals |
| **LCP / FID / CLS** | Core Web Vitals (Largest Contentful Paint / First Input Delay / Cumulative Layout Shift) |
| **NAP** | Name / Address / Phone — must be consistent across web for local SEO (less relevant here) |
| **GBP** | Google Business Profile — not used in our lead-gen-front model |
| **DNI** | Dynamic Number Insertion — per-page tracked phone numbers (Phase 5/6) |
| **llms.txt** | Emerging standard file declaring site structure to AI crawlers |
| **Hub-and-spoke** | Linking pattern where category pages link to detail pages and vice-versa |
| **Answer-first** | Content structure where the answer precedes context — AI engines prefer this |
