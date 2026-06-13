/**
 * Next.js instrumentation hook (MON-1).
 *
 * Called once per worker on startup. We use it to load the right Sentry
 * config for the current runtime — Node for server routes, Edge for
 * middleware.
 *
 * Sentry init is a no-op if SENTRY_DSN isn't set, so this is safe to ship
 * before the DSN is provisioned in Secrets Manager.
 *
 * Spec: docs/phase-0-plan.md — Burst 0e
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Re-export Sentry's request-error hook so unhandled errors in route
// handlers get captured automatically.
export { onRequestError } from '@sentry/nextjs';
