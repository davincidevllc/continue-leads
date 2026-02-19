import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'crypto';

const AUTH_COOKIE = 'cl_admin_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret) throw new Error('ADMIN_AUTH_SECRET not set');
  return secret;
}

function makeToken(timestamp: number): string {
  const payload = `${timestamp}`;
  const hmac = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${timestamp}.${hmac}`;
}

function verifyToken(token: string): boolean {
  const [tsStr, sig] = token.split('.');
  if (!tsStr || !sig) return false;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  if (Date.now() - ts > SESSION_DURATION_MS) return false;
  const expected = crypto.createHmac('sha256', getSecret()).update(tsStr).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

export function verifyPassword(password: string): boolean {
  return password === getSecret();
}

export async function createSession(): Promise<void> {
  const token = makeToken(Date.now());
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS / 1000,
    path: '/',
  });
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE)?.value;
    if (!token) return false;
    return verifyToken(token);
  } catch {
    return false;
  }
}

export async function requireAuth(): Promise<void> {
  const authed = await isAuthenticated();
  if (!authed) redirect('/login');
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}
