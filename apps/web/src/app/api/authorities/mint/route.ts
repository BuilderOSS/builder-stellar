import { NextResponse } from 'next/server';

import { getGoldskyMintAuthorities } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const daoId = new URL(request.url).searchParams.get('daoId');
    if (!daoId) return NextResponse.json({ message: 'daoId is required' }, { status: 400 });
    return NextResponse.json(await getGoldskyMintAuthorities(daoId), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), message: 'Mint authorities unavailable' },
      { status: 503 }
    );
  }
}
