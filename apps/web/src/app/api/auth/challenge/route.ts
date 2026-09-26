import { randomBytes } from 'node:crypto';

import { StrKey } from '@stellar/stellar-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAuthMessage } from '@/lib/auth/message';
import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  AUTH_CHALLENGE_TTL_MS,
  getAuthAppName,
  getAuthOrigin,
  getAuthSession,
  getConfiguredNetwork,
  getSep10ServerKeypair
} from '@/lib/auth/server';
import type { AuthChallengeResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

const challengeSchema = z.object({ address: z.string().min(1) });

export async function POST(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'challenge', 30);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = challengeSchema.safeParse(await request.json());
    if (!body.success || !StrKey.isValidEd25519PublicKey(body.data.address)) {
      return NextResponse.json({ code: 'INVALID_MESSAGE', message: 'Invalid wallet address.' }, { status: 400 });
    }

    const network = getConfiguredNetwork();
    const uri = getAuthOrigin(request);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + AUTH_CHALLENGE_TTL_MS);
    const challenge = {
      address: body.data.address,
      nonce: randomBytes(32).toString('hex'),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      network: network.name,
      domain: new URL(uri).host,
      uri
    };
    const serverKeypair = getSep10ServerKeypair();
    const unsignedMessage = createAuthMessage({
      appName: getAuthAppName(),
      address: challenge.address,
      domain: challenge.domain,
      uri: challenge.uri,
      network: network.label,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expiresAt
    });
    const serverPublicKey = serverKeypair.publicKey();
    const serverSignature = Buffer.from(serverKeypair.signMessage(unsignedMessage)).toString('base64');

    const session = await getAuthSession();
    delete session.address;
    delete session.network;
    delete session.authMethod;
    delete session.authenticatedAt;
    session.challenge = { method: 'sep53', ...challenge, serverPublicKey, serverSignature };
    await session.save();

    const response: AuthChallengeResponse = {
      appName: getAuthAppName(),
      nonce: challenge.nonce,
      domain: challenge.domain,
      uri: challenge.uri,
      network: network.label,
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expiresAt,
      serverPublicKey,
      serverSignature
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Auth challenge failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'Unable to create authentication challenge.' }, { status: 500 });
  }
}
