import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const AUTH_COOKIE = 'cl_admin_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function verifyToken(token: string, secret: string): boolean {
  const [tsStr, sig] = token.split('.');
  if (!tsStr || !sig) return false;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  if (Date.now() - ts > SESSION_DURATION_MS) return false;
  const expected = crypto.createHmac('sha256', secret).update(tsStr).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for login page and API auth routes
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const secret = process.env.ADMIN_AUTH_SECRET;

  if (!token || !secret || !verifyToken(token, secret)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
