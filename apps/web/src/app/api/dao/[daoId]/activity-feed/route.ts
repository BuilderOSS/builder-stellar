import { NextResponse } from 'next/server';

import { parseLimit, parseNonNegativeInteger } from '@/lib/api-pagination';
import { getGoldskyActivityFeed } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const url = new URL(request.url);
  const { daoId } = await params;
  const limit = parseLimit(url.searchParams.get('limit') ?? url.searchParams.get('pageSize'), 8);
  const offset = parseNonNegativeInteger(url.searchParams.get('offset'), 0);
  const contractId = url.searchParams.get('contractId') ?? undefined;
  const contractRole = url.searchParams.get('contractRole') ?? undefined;
  const actor = url.searchParams.get('actor') ?? undefined;
  const kind = url.searchParams.get('kind') ?? undefined;

  try {
    const payload = await getGoldskyActivityFeed(daoId, { limit, offset, contractId, contractRole, actor, kind });
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
