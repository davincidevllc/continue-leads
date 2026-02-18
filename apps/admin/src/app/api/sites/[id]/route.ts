import { NextRequest, NextResponse } from 'next/server';
import { getSite, updateSite, setSiteMetros } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(site);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const { metro_ids, ...siteData } = data;
    const site = await updateSite(id, siteData);
    if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (Array.isArray(metro_ids)) {
      await setSiteMetros(id, metro_ids);
    }
    return NextResponse.json(site);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
