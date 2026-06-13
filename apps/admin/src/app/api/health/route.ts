/**
 * GET /api/health — MON-2
 *
 * Lightweight health check used by:
 *   - The ALB target group (replaces the default `/` check, which gets
 *     auth-bounced and reports the app as unhealthy).
 *   - External uptime monitors (UptimeRobot free tier, Better Stack, etc.).
 *   - Operators eyeballing whether the deploy is up after a release.
 *
 * Returns:
 *   {
 *     status: 'healthy' | 'unhealthy',
 *     version: <git sha or 'unknown'>,
 *     region:  <AWS_REGION or 'us-east-1'>,
 *     db:      'ok' | 'fail',
 *     dbLatencyMs: <number | null>,
 *     responseTimeMs: <number>,
 *     timestamp: <ISO8601>,
 *   }
 *
 * HTTP status mirrors the status field — 200 if healthy, 503 if not.
 *
 * Public — no auth required. Middleware bypass list includes this path.
 *
 * Spec: docs/phase-0-plan.md — Burst 0e (MON-2)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Pool } from 'pg';
import pool from '@/lib/pool';

export const dynamic = 'force-dynamic';

const typedPool = pool as Pool;
const DB_TIMEOUT_MS = 1000;

async function checkDb(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const started = Date.now();
  try {
    await Promise.race([
      typedPool.query('SELECT 1 AS ok'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB health check timed out')), DB_TIMEOUT_MS)
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

export async function GET(_request: NextRequest) {
  const started = Date.now();
  const db = await checkDb();

  const body = {
    status: db.ok ? ('healthy' as const) : ('unhealthy' as const),
    version: process.env.GIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || 'unknown',
    region: process.env.AWS_REGION || 'us-east-1',
    db: db.ok ? ('ok' as const) : ('fail' as const),
    dbLatencyMs: db.latencyMs,
    responseTimeMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: db.ok ? 200 : 503,
    headers: {
      // Don't cache health checks. CDN / ALB layers must always see the
      // latest state.
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
    },
  });
}
