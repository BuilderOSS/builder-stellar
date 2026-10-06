import { NextResponse } from 'next/server';

import { getGoldskyActivityFeed } from '@/lib/goldsky';
import { parseLimit, parseNonNegativeInteger } from '@/lib/api-pagination';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const url = new URL(request.url);
  const { daoId } = await params;
  const limit = parseLimit(url.searchParams.get('limit') ?? url.searchParams.get('pageSize'), 8);
  const offset = parseNonNegativeInteger(url.searchParams.get('offset'), 0);
  const contractId = url.searchParams.get('contractId') ?? undefined;
  const kind = url.searchParams.get('kind') ?? undefined;

  try {
    const payload = await getGoldskyActivityFeed(daoId, { limit, offset, contractId, kind });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Activity feed unavailable'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
