import { createHash } from 'node:crypto';

import { WebAuth } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  AuthError,
  authErrorResponse,
  claimAuthChallenge,
  consumeAuthChallenge,
  getAuthSession,
  getConfiguredNetwork,
  getSep10ServerKeypair,
  releaseAuthChallenge
} from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const verifySchema = z.object({ signedTxXdr: z.string().min(1) });

export async function POST(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'sep10-verify', 10);
  if (rateLimitResponse) return rateLimitResponse;

  let claimedChallenge: string | undefined;
  try {
    const body = verifySchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { code: 'INVALID_MESSAGE', message: 'Invalid SEP-10 authentication proof.' },
        { status: 400 }
      );
    }

    const session = await getAuthSession();
    const challenge = session.challenge;
    if (!challenge || challenge.method !== 'sep10' || challenge.xdr !== body.data.signedTxXdr) {
      throw new AuthError('NO_CHALLENGE', 'SEP-10 authentication challenge is missing or already consumed.');
    }

    const expiresAt = Date.parse(challenge.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new AuthError('CHALLENGE_EXPIRED', 'SEP-10 authentication challenge has expired.');
    }

    const challengeId = createHash('sha256').update(challenge.xdr).digest('hex');
    const claim = claimAuthChallenge(challengeId, expiresAt);
    if (!claim.success) {
      throw new AuthError(
        'NO_CHALLENGE',
        claim.reason === 'consumed'
          ? 'Challenge already used. Please request a new one.'
          : 'Challenge verification in progress. Please wait.'
      );
    }
    claimedChallenge = challengeId;

    const network = getConfiguredNetwork();
    if (challenge.network !== network.name) {
      throw new AuthError('NETWORK_MISMATCH', 'SEP-10 authentication network does not match this deployment.');
    }

    const serverKeypair = getSep10ServerKeypair();
    const serverAddress = serverKeypair.publicKey();
    const parsed = WebAuth.readChallengeTx(
      body.data.signedTxXdr,
      serverAddress,
      network.networkPassphrase,
      challenge.homeDomain,
      challenge.webAuthDomain
    );
    if (parsed.clientAccountID !== challenge.address) {
      throw new AuthError('INVALID_MESSAGE', 'SEP-10 authentication address does not match the challenge.');
    }

    WebAuth.verifyChallengeTxSigners(
      body.data.signedTxXdr,
      serverAddress,
      network.networkPassphrase,
      [challenge.address],
      challenge.homeDomain,
      challenge.webAuthDomain
    );

    session.address = parsed.clientAccountID;
    session.network = network.name;
    session.authMethod = 'sep10';
    session.authenticatedAt = Date.now();
    await session.save();
    consumeAuthChallenge(claimedChallenge);

    return NextResponse.json(
      { authenticated: true, address: parsed.clientAccountID, authMethod: 'sep10' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (claimedChallenge) releaseAuthChallenge(claimedChallenge);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { code: 'INVALID_MESSAGE', message: 'Invalid SEP-10 authentication proof.' },
        { status: 400 }
      );
    }
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error('SEP-10 verification failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'Unable to verify SEP-10 wallet authentication.' }, { status: 422 });
  }
}
