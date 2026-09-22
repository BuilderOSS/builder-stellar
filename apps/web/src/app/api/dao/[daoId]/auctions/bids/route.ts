import { NextResponse } from 'next/server';

import { getGoldskyAuctionBids } from '@/lib/goldsky';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const { daoId } = await params;
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  if (!tokenId || !/^\d+$/.test(tokenId)) return NextResponse.json({ message: 'tokenId is required' }, { status: 400 });
  return NextResponse.json({ items: await getGoldskyAuctionBids(daoId, tokenId, 100) });
}
