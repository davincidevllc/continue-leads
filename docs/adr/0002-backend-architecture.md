# ADR 0002: Backend Service Architecture

## Status
Accepted

## Context
We need to decide how to structure backend services: monolithic, or separated services with different scaling/deployment characteristics.

## Decision
**Standalone services connected by AWS SQS:**

- `apps/admin`: Next.js (CMS/Admin UI + non-latency-critical admin APIs)
- `services/ingestion`: Node.js + Express (public lead intake, blocking validation, outbox writes)
- `services/pingpost`: Node.js worker (SQS consumer, auction engine, buyer delivery)

## Rationale
- Ping-post needs independent scaling, latency control, and deployment isolation
- Ingestion is public-facing and must be hardened independently
- Admin app has different traffic patterns and can tolerate higher latency
- SQS provides reliable async communication with at-least-once delivery

## Consequences
- Transactional outbox pattern required (DB + poller) to guarantee no message loss between ingestion and SQS
- Consumer idempotency required for SQS at-least-once delivery
- Three separate deployment targets (ECS Fargate services)
- More operational complexity, but each service can be reasoned about independently
