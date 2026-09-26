import { StrKey, WebAuth } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  getAuthSession,
  getConfiguredNetwork,
  getSep10Domains,
  getSep10ServerKeypair,
  SEP10_CHALLENGE_TTL_SECONDS
} from '@/lib/auth/server';
import type { Sep10ChallengeResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'sep10-challenge', 30);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const address = new URL(request.url).searchParams.get('address')?.trim() || '';
    if (!StrKey.isValidEd25519PublicKey(address)) {
      return NextResponse.json({ code: 'INVALID_MESSAGE', message: 'Wallet address is invalid.' }, { status: 400 });
    }

    const network = getConfiguredNetwork();
    const { homeDomain, webAuthDomain } = getSep10Domains(request);
    const expiresAt = new Date(Date.now() + SEP10_CHALLENGE_TTL_SECONDS * 1000).toISOString();
    const xdr = WebAuth.buildChallengeTx(
      getSep10ServerKeypair(),
      address,
      homeDomain,
      SEP10_CHALLENGE_TTL_SECONDS,
      network.networkPassphrase,
      webAuthDomain
    );

    const session = await getAuthSession();
    delete session.address;
    delete session.network;
    delete session.authMethod;
    delete session.authenticatedAt;
    session.challenge = {
      method: 'sep10',
      address,
      xdr,
      expiresAt,
      network: network.name,
      homeDomain,
      webAuthDomain
    };
    await session.save();

    const response: Sep10ChallengeResponse = { address, network: network.label, xdr, expiresAt };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('SEP-10 challenge failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'Unable to create SEP-10 authentication challenge.' }, { status: 500 });
  }
}
