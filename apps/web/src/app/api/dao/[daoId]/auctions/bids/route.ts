import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { getGoldskyAuctionBids } from '@/lib/goldsky';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const { daoId } = await params;
  const tokenId = new URL(request.url).searchParams.get('tokenId');
  if (!tokenId || !/^\d+$/.test(tokenId)) return NextResponse.json({ message: 'tokenId is required' }, { status: 400 });
  try {
    return NextResponse.json({ items: await getGoldskyAuctionBids(daoId, tokenId, 100) });
  } catch (error) {
    return internalErrorResponse('auction-bids', error, { items: [], message: 'Bids are unavailable. Try again.' });
  }
}
