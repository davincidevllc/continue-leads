# Continue Leads

Programmatic lead generation platform — creates and operates networks of SEO-optimized websites, captures leads, and sells them via real-time ping-post auctions.

## Architecture

```
apps/
  admin/          → Next.js admin dashboard (Bootstrap UI)

services/
  ingestion/      → Lead capture + validation + outbox (Express)
  pingpost/       → Auction engine + buyer delivery (SQS consumer)

packages/
  shared/         → TypeScript contracts, enums, constants
  db/             → PostgreSQL migrations, pool, query helpers

docs/
  adr/            → Architecture Decision Records
  interfaces/     → SQS message schemas, API contracts
  acceptance/     → Milestone acceptance checklists
```

## Tech Stack

- **Language:** TypeScript (strict)
- **Monorepo:** pnpm workspaces + Turborepo
- **Database:** PostgreSQL (pgcrypto + btree_gist)
- **Admin UI:** Next.js + Bootstrap
- **Services:** Node.js + Express
- **Queue:** AWS SQS (Standard)
- **Hosting:** AWS (ECS Fargate, RDS, S3, CloudFront, Route 53)
- **Testing:** Vitest
- **CI/CD:** GitHub Actions

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- AWS account (staging + production)

### Install
```bash
pnpm install
```

### Build
```bash
pnpm build
```

### Test
```bash
pnpm test
```

### Run Migrations
```bash
# Staging
pnpm db:migrate:staging

# Production
pnpm db:migrate:production
```

## Launch Scope

- **Verticals:** Interior Painting, Residential Cleaning, Siding
- **Metros:** Boston MA, Dallas TX, Houston TX, Atlanta GA, Miami FL
- **Domains:** 15 (1 per vertical per metro)

## Phase Roadmap

- **Phase 1:** Site Factory + Content Engine + Deployment + Basic Lead Capture
- **Phase 2:** Lead Capture Pipeline (validation, dedupe, outbox, SQS)
- **Phase 3:** Ping-Post + Monetization (auctions, buyers, delivery)

## Environment Variables

```bash
NODE_ENV=staging|production
DATABASE_URL=postgresql://...
AWS_REGION=us-east-1
KMS_KEY_ID=...
SQS_QUEUE_URL=...
```

## License

Proprietary — DaVinci Development / Continue Leads LLC
