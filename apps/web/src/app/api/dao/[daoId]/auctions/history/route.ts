import { NextResponse } from 'next/server';

import { AuctionHistoryError, readAuctionHistory } from '@/lib/auction-history/query';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    const result = await readAuctionHistory(daoId, new URL(request.url).searchParams);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Auction history unavailable.' },
      { status: error instanceof AuctionHistoryError ? error.status : 500 }
    );
  }
}
