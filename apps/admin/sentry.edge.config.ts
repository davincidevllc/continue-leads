/**
 * Sentry config — Edge runtime (middleware).
 *
 * The Edge runtime has a stripped-down Node API. Sentry's Edge support
 * captures errors from middleware code only. No tracing (Edge doesn't
 * support the full perf SDK), no replays.
 *
 * Loaded by `instrumentation.ts` on each Edge worker startup when running
 * NEXT_RUNTIME=edge.
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
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // No tracing on Edge — keeps the runtime small.
    tracesSampleRate: 0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
    ],
  });
}
