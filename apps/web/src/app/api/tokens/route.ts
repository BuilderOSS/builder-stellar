import { NextResponse } from 'next/server';

import { getGoldskyTokenInventory } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitValue = Number(url.searchParams.get('limit') ?? '100');
  const offsetValue = Number(url.searchParams.get('offset') ?? '0');
  if (!Number.isInteger(limitValue) || !Number.isInteger(offsetValue) || limitValue < 1 || offsetValue < 0) {
    return NextResponse.json({ message: 'limit and offset must be valid non-negative integers' }, { status: 400 });
  }
  const limit = Math.min(limitValue, 1000);
  const offset = offsetValue;

  try {
    const payload = await getGoldskyTokenInventory({ limit, offset });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        totalSupply: '0',
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Token inventory unavailable'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
