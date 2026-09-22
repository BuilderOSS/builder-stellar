import { NextResponse } from 'next/server';

import { getGoldskyMintAuthorities } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    return NextResponse.json(await getGoldskyMintAuthorities(daoId), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), message: 'Mint authorities unavailable' },
      { status: 503 }
    );
  }
}
