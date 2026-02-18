import { NextRequest, NextResponse } from 'next/server';
import { getVertical, updateVertical } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getVertical(id);
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(v);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const v = await updateVertical(id, data);
    if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(v);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
