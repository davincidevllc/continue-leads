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
    has_admin_secret: !!process.env.ADMIN_AUTH_SECRET,
    env_keys: Object.keys(process.env).filter(k => 
      !k.startsWith('npm_') && !k.startsWith('NODE') && !k.startsWith('PATH') && !k.startsWith('HOME')
      && !k.startsWith('HOSTNAME') && !k.startsWith('SHLVL') && !k.startsWith('_')
    ).sort()
  });
}
