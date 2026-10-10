import { NextResponse } from 'next/server';

import { getAuthSession } from '@/lib/auth/server';
import { ClaimError } from '@/lib/minter/identity';
import { currentClaims } from '@/lib/minter/service';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  try {
    const session = await getAuthSession();
    const actor = session.address && session.network ? { address: session.address, network: session.network } : null;
    return NextResponse.json(await currentClaims((await params).daoId, actor), { headers });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof ClaimError
            ? error.message
            : 'Current Minter state is unavailable. Claims are disabled until RPC state can be verified.'
      },
      { status: error instanceof ClaimError ? error.status : 503, headers }
    );
  }
}
