import { NextResponse } from 'next/server';

import { getGoldskyAuctionBids } from '@/lib/goldsky';

export async function GET(request: Request) {
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  if (!tokenId || !/^\d+$/.test(tokenId)) return NextResponse.json({ message: 'Invalid token ID' }, { status: 400 });
  return NextResponse.json({ items: await getGoldskyAuctionBids(tokenId, 100) });
}
