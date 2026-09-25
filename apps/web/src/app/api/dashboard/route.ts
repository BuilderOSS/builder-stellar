import { NextResponse } from 'next/server';

import { authErrorResponse, requireAuthenticatedSession } from '@/lib/auth/server';
import { getDashboardData } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

function parseNonNegativeInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseLimit(value: string | null, fallback = 20) {
  return Math.min(Math.max(parseNonNegativeInt(value, fallback), 1), 100);
}

export async function GET(request: Request) {
  let address: string;
  try {
    ({ address } = await requireAuthenticatedSession());
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const url = new URL(request.url);
    const payload = await getDashboardData(address, {
      limit: parseLimit(url.searchParams.get('limit')),
      offset: parseNonNegativeInt(url.searchParams.get('offset'), 0)
    });

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        myDaos: [],
        feed: { items: [], total: 0, limit: 20, offset: 0, hasMore: false },
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Dashboard data unavailable'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
