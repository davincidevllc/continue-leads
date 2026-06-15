/**
 * Sentry config — browser (client components, page loads, user interactions).
 *
 * Loaded by Next.js at build time when wrapped via `withSentryConfig` in
 * next.config.js. Initializes Sentry only when SENTRY_DSN is present.
 *
 * Note: the env var here uses NEXT_PUBLIC_SENTRY_DSN so the DSN is exposed
 * to the client bundle (DSNs are designed to be public — they identify a
 * project, they don't grant write access to anything beyond error events).
 *
 * Spec: docs/phase-0-plan.md — Burst 0e (MON-1)
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development',
    release:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
      process.env.NEXT_PUBLIC_GIT_SHA ||
      undefined,
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    tracesSampleRate: 0.1,
    // Replays disabled for now — adds bundle weight + can capture PII.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: [
      // Browser quirks not worth alerting on.
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      // Ad blockers cancelling requests.
      /^NetworkError when attempting to fetch/,
      /^Failed to fetch/,
      // Random unhandled extension errors.
      /^chrome-extension:/,
      /^moz-extension:/,
    ],
  });
}
