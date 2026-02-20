import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json();
  if (body.secret !== process.env.ADMIN_AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    has_pii_key: !!process.env.PII_ENCRYPTION_KEY,
    pii_key_length: process.env.PII_ENCRYPTION_KEY?.length || 0,
  });
}
