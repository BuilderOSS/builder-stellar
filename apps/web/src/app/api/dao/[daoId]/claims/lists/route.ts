import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { limitApiRequest } from '@/lib/api-rate-limit';
import { ClaimError } from '@/lib/minter/identity';
import { openClaimLists } from '@/lib/minter/open-lists';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  // Read-model queries for every open list of the tribe's ClaimMinter.
  const limited = await limitApiRequest(request, 'claims');
  if (limited) return limited;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return NextResponse.json(await openClaimLists((await params).daoId), { headers });
  } catch (error) {
    if (error instanceof ClaimError)
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    return internalErrorResponse(
      'claim-lists',
      error,
      { message: 'Open claim lists are unavailable. Claim lists on chain are not affected.' },
      { headers }
    );
  }
}
