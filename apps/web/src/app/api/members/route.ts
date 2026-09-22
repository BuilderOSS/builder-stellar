import { NextResponse } from 'next/server';

import { getGoldskyMemberList } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const daoId = url.searchParams.get('daoId');
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || offset < 0) {
    return NextResponse.json({ message: 'limit and offset must be valid non-negative integers' }, { status: 400 });
  }

  try {
    if (!daoId) return NextResponse.json({ message: 'daoId is required' }, { status: 400 });
    return NextResponse.json(await getGoldskyMemberList(daoId, { limit: Math.min(limit, 1000), offset }), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch {
    return NextResponse.json(
      {
        items: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
        generatedAt: new Date().toISOString(),
        message: 'Member list unavailable'
      },
      { status: 503 }
    );
  }
}
