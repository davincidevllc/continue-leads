# ADR 0003: Canonical Lead Contract + Lifecycle

## Status
Accepted

## Context
We need a stable data contract that all subsystems (ingestion, auctions, admin) can rely on, with fast routing capabilities and full audit history.

## Decision
**Versioned question sets with normalized value drivers + JSONB response snapshots.**

### Lead Lifecycle State Machine
```
NEW → VALIDATED → QUALIFIED → QUEUED → OFFERED → SOLD/REJECTED/EXPIRED/UNSOLD
```

### Key Design Rules
- Money is stored as integer cents everywhere (no floats)
- `tcpa_consent` naming: DB = `tcpa_consent`, TypeScript = `tcpaConsent`
- Full bid records per auction (every buyer's response, amount, latency, errors)
- UNSOLD is a terminal state for leads that fail all retry attempts (separate from EXPIRED)

### Three-Layer Idempotency
1. **Submission idempotency**: `UNIQUE(site_id, idempotency_key)` — duplicate submissions return existing lead_id
2. **Dedupe (cross-domain, time-window, race-safe)**: `lead_dedupe_claims` with btree_gist exclusion constraint. Policy: store + flag + never enqueue.
3. **Consumer idempotency**: `consumer_event_receipts` keyed by `event_id` prevents SQS redelivery from re-auctioning

### Validation Split
- **Blocking** (pre-store): field validation, phone normalization, dedupe claims, honeypot, rate limit, TCPA consent, junk detection
- **Non-blocking** (post-store): email verification, carrier lookup, fraud scoring

## Rationale
- Normalized value drivers enable fast routing without JSON parsing
- Versioned question sets allow schema evolution without breaking existing leads
- Append-only status events provide complete audit trail
- Exclusion constraint on dedupe claims is race-safe under concurrent writes

## Consequences
- Schema is more complex but operationally robust
- All subsystems must use the canonical TypeScript types from `packages/shared`
- Dedupe window is configurable per vertical (default 7 days)
