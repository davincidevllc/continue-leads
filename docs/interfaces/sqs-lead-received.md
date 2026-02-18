# SQS LeadReceived Message Schema

## Queue
- **Type:** AWS SQS Standard
- **Name:** `continue-leads-{env}-lead-received` (e.g., `continue-leads-staging-lead-received`)

## Message Schema (v1.0)

```typescript
interface LeadReceivedMessage {
  schemaVersion: "1.0";
  eventType: "LeadReceived";
  eventId: string;        // UUID — for consumer idempotency
  occurredAt: string;     // ISO 8601 — when event was published
  leadId: string;         // UUID
  correlationId: string;  // UUID — trace across systems
  createdAt: string;      // ISO 8601 — when lead was captured (staleness check)

  service: {
    categoryId: string;
    serviceId: string;
    serviceTypeId: string | null;
    questionSetId: string | null;
    questionSetVersionId: string | null;
  };

  location: {
    targetingMode: "NATIONWIDE" | "STATE" | "ZIP_RADIUS" | "METRO";
    state: string | null;
    zip: string | null;
    radiusMiles: number | null;
    metroSlug: string | null;
  };

  value: {
    urgency: string | null;
    propertyType: string | null;
    projectSizeBucket: string | null;
    budgetRange: string | null;
    timeframeDays: number | null;
  };

  attribution: {
    domain: string;
    pageUrl: string;
    pageType: string;
    utm: {
      source: string | null;
      medium: string | null;
      campaign: string | null;
      term: string | null;
      content: string | null;
    };
  };

  compliance: {
    tcpaConsent: boolean;
    consentTextVersion: string;
  };

  dedupe: {
    dedupeWindowSeconds: number;
    dedupeHit: boolean;
  };
}
```

## Transactional Outbox Pattern

1. Ingestion writes lead tables + `outbox_events` row in a single DB transaction
2. Outbox poller queries `PENDING` events where `next_available_at <= now()`
3. Poller publishes to SQS, marks event `SENT`
4. On failure: increment `attempts`, set exponential backoff on `next_available_at`
5. After `max_attempts` (default 5): mark `FAILED`, alert via CloudWatch

## Consumer Idempotency

1. On message receive: attempt `INSERT INTO consumer_event_receipts (event_id, lead_id, consumer_id)`
2. If conflict (duplicate `event_id` + `consumer_id`): ACK message and exit
3. If success: proceed to auction logic
4. TTL cleanup: periodic job deletes receipts older than 30 days

## Staleness Check

Before starting an auction, the consumer checks:
```
IF (now() - message.createdAt) > STALENESS_SLA_SECONDS THEN
  → Set lead status to EXPIRED
  → ACK message
  → Do not auction
```

Default staleness SLA: 900 seconds (15 minutes)
