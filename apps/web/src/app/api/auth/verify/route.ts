import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AccountLookupError, verifySep53SignerWeight } from '@/lib/auth/account-signers';
import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  AuthError,
  authErrorResponse,
  claimAuthChallenge,
  consumeAuthChallenge,
  getAuthAppName,
  getAuthOrigin,
  getAuthSession,
  getConfiguredNetwork,
  rejectCrossSiteRequest,
  releaseAuthChallenge,
  startSessionAccount
} from '@/lib/auth/server';
import { verifyAuthProof } from '@/lib/auth/verification';

export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  address: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1)
});

/**
 * SEP-53 sign-in, step 2: checks the wallet's signature over the challenge message issued to this
 * session, then that the signing key still has enough weight on its account, and only then signs
 * the session in. Each challenge works once.
 */
export async function POST(request: Request) {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite) return crossSite;
  const rateLimitResponse = enforceAuthRateLimit(request, 'verify', 10);
  if (rateLimitResponse) return rateLimitResponse;

  let claimedNonce: string | undefined;
  try {
    const body = verifySchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ code: 'INVALID_MESSAGE', message: 'Invalid authentication proof.' }, { status: 400 });
    }

    const network = getConfiguredNetwork();
    const uri = getAuthOrigin(request);
    const domain = new URL(uri).host;
    const session = await getAuthSession();
    const challenge = session.challenge;
    if (!challenge || challenge.method !== 'sep53') {
      throw new AuthError('NO_CHALLENGE', 'Authentication challenge is missing or already consumed.');
    }
    const claim = claimAuthChallenge(challenge.nonce, Date.parse(challenge.expiresAt));
    if (!claim.success) {
      throw new AuthError(
        'NO_CHALLENGE',
        claim.reason === 'consumed'
          ? 'Challenge already used. Please request a new one.'
          : 'Challenge verification in progress. Please wait.'
      );
    }
    claimedNonce = challenge.nonce;

    verifyAuthProof({
      ...body.data,
      session,
      appName: getAuthAppName(),
      network,
      domain,
      uri
    });
    // The signature proves the caller holds the address's own key. Check that the key still speaks
    // for the account, so a master key that was disabled or outweighed can't sign in.
    await verifySep53SignerWeight(body.data.address, network);

    startSessionAccount(session, { address: body.data.address, network: network.name, authMethod: 'sep53' });
    await session.save();
    consumeAuthChallenge(claimedNonce);

    return NextResponse.json(
      { authenticated: true, address: body.data.address, authMethod: 'sep53' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (claimedNonce) releaseAuthChallenge(claimedNonce);
    if (error instanceof AccountLookupError) {
      return NextResponse.json(
        { code: 'ACCOUNT_LOOKUP_UNAVAILABLE', message: error.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ code: 'INVALID_MESSAGE', message: 'Invalid authentication proof.' }, { status: 400 });
    }
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error('Auth verification failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'Unable to verify wallet authentication.' }, { status: 500 });
  }
}
