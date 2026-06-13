/**
 * Sentry config — Node.js runtime (server-side, API routes, server components).
 *
 * Loaded by `instrumentation.ts` on each worker startup when running
 * NEXT_RUNTIME=nodejs. Initializes Sentry only when SENTRY_DSN is present
 * — keeps local dev and pre-provisioning environments quiet.
 *
 * Sampling strategy (per multi-tenancy-spec / Phase 0 plan):
 *   - Errors: 100% in staging, 10% in production.
 *   - Performance traces: 10% always (low base rate to stay within free tier).
 *
 * Spec: docs/phase-0-plan.md — Burst 0e (MON-1)
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.GIT_SHA || undefined,
    // Errors
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Tracing — kept low to stay within Sentry's free tier.
    tracesSampleRate: 0.1,
    // Don't capture noisy errors that aren't actionable.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      // pg pool timeout when client is slow — surfaces as ETIMEDOUT but we already log it.
      /^Connection terminated/,
    ],
    // Strip query params and request bodies from breadcrumbs — PII safety.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http' && breadcrumb.data?.url) {
        breadcrumb.data.url = String(breadcrumb.data.url).split('?')[0];
      }
      return breadcrumb;
    },
    // Don't send Sentry's own internal logs.
    debug: false,
  });
}
