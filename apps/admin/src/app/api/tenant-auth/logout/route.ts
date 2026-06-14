/**
 * POST /api/tenant-auth/logout — MT-7
 *
 * Tenant logout. Same shape as platform logout — both endpoints exist for
 * URL symmetry and to make role-specific telemetry easier later.
 *
 * Spec: docs/multi-tenancy-spec.md
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  clearedCookieOptions,
  deleteSessionByToken,
} from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    try {
      await deleteSessionByToken(rawToken);
    } catch {
      // Swallow — logout should always succeed from the user's perspective.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedCookieOptions());
  return response;
}
