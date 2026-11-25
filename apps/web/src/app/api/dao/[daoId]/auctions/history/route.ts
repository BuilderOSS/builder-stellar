import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { AuctionHistoryError, readAuctionHistory } from '@/lib/auction-history/query';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    const result = await readAuctionHistory(daoId, new URL(request.url).searchParams);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AuctionHistoryError)
      return NextResponse.json({ message: error.message }, { status: error.status });
    return internalErrorResponse(
      'auction-history',
      error,
      { message: 'Auction history is unavailable. Try again.' },
      { status: 500 }
    );
  }
}
