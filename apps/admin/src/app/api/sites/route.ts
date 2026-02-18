import { NextRequest, NextResponse } from 'next/server';
import { listSites, createSite } from '@/lib/db';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows, total } = await listSites({
    status: sp.get('status') || undefined,
    vertical_id: sp.get('vertical_id') || undefined,
    search: sp.get('search') || undefined,
    limit: parseInt(sp.get('limit') ?? '50'),
    offset: parseInt(sp.get('offset') ?? '0'),
  });
  return NextResponse.json({ rows, total });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.domain || !data.vertical_id || !data.template_id) {
      return NextResponse.json({ error: 'domain, vertical_id, template_id required' }, { status: 400 });
    }
    const site = await createSite(data);
    return NextResponse.json(site, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Domain already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
