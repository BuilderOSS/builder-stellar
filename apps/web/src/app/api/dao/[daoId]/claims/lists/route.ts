import { NextResponse } from 'next/server';

import { ClaimError } from '@/lib/minter/identity';
import { openClaimLists } from '@/lib/minter/open-lists';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return NextResponse.json(await openClaimLists((await params).daoId), { headers });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof ClaimError
            ? error.message
            : 'Open claim lists are unavailable. Claim lists on chain are not affected.'
      },
      { status: error instanceof ClaimError ? error.status : 503, headers }
    );
  }
}
