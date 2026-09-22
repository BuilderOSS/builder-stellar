import { NextResponse } from 'next/server';

import { getGoldskyAuctionBids } from '@/lib/goldsky';

export async function GET(request: Request) {
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  const daoId = new URL(request.url).searchParams.get('daoId');
  if (!daoId || !tokenId || !/^\d+$/.test(tokenId)) return NextResponse.json({ message: 'daoId and tokenId are required' }, { status: 400 });
  return NextResponse.json({ items: await getGoldskyAuctionBids(daoId, tokenId, 100) });
}
