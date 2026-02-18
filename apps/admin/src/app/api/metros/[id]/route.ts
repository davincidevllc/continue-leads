import { NextRequest, NextResponse } from 'next/server';
import { getMetro, updateMetro } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const metro = await getMetro(id);
  if (!metro) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(metro);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const metro = await updateMetro(id, data);
    if (!metro) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(metro);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
