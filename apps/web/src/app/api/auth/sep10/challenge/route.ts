import { StrKey, WebAuth } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  clearSessionAccount,
  getAuthSession,
  getConfiguredNetwork,
  getSep10Domains,
  getSep10ServerKeypair,
  rejectCrossSiteRequest,
  SEP10_CHALLENGE_TTL_SECONDS
} from '@/lib/auth/server';
import type { Sep10ChallengeResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

const challengeSchema = z.object({ address: z.string().min(1) });

/**
 * SEP-10 sign-in, step 1 (the fallback for wallets that can't sign messages): builds a server-signed
 * challenge transaction for `address` and stores it in the session. It is POST only, because it
 * writes the session and signs it out of any previous account; a GET has no side effects.
 */
export async function POST(request: Request) {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite) return crossSite;
  const rateLimitResponse = enforceAuthRateLimit(request, 'sep10-challenge', 30);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = challengeSchema.safeParse(await request.json());
    const address = body.success ? body.data.address.trim() : '';
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
    clearSessionAccount(session);
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

    const response: Sep10ChallengeResponse = {
      address,
      network: network.label,
      xdr,
      expiresAt,
      homeDomain,
      webAuthDomain
    };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ code: 'INVALID_MESSAGE', message: 'Wallet address is invalid.' }, { status: 400 });
    }
    console.error('SEP-10 challenge failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'Unable to create SEP-10 authentication challenge.' }, { status: 500 });
  }
}
