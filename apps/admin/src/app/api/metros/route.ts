import { NextRequest, NextResponse } from 'next/server';
import { listMetros, createMetro } from '@/lib/db';

export async function GET() {
  const metros = await listMetros();
  return NextResponse.json(metros);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.name || !data.state || !data.slug) {
      return NextResponse.json({ error: 'name, state, slug required' }, { status: 400 });
    }
    const metro = await createMetro(data);
    return NextResponse.json(metro, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
