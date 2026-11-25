import { NextResponse } from 'next/server';

import { internalErrorResponse } from '@/lib/api-error';
import { limitApiRequest } from '@/lib/api-rate-limit';
import { getAuthSession } from '@/lib/auth/server';
import { ClaimError } from '@/lib/minter/identity';
import { currentClaims } from '@/lib/minter/service';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  // Chain reads, and the claim list from IPFS on a cache miss.
  const limited = await limitApiRequest(request, 'claims');
  if (limited) return limited;
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  try {
    const session = await getAuthSession();
    const actor = session.address && session.network ? { address: session.address, network: session.network } : null;
    return NextResponse.json(await currentClaims((await params).daoId, actor), { headers });
  } catch (error) {
    if (error instanceof ClaimError)
      return NextResponse.json({ message: error.message }, { status: error.status, headers });
    return internalErrorResponse(
      'claims',
      error,
      { message: 'Current Minter state is unavailable. Claims are disabled until RPC state can be verified.' },
      { headers }
    );
  }
}
