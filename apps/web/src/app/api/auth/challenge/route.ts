import { randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  AUTH_CHALLENGE_TTL_MS,
  getAuthAppName,
  getAuthOrigin,
  getAuthSession,
  getConfiguredNetwork
} from '@/lib/auth/server';
import type { AuthChallengeResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'challenge', 30);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const network = getConfiguredNetwork();
    const uri = getAuthOrigin(request);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + AUTH_CHALLENGE_TTL_MS);
    const challenge = {
      nonce: randomBytes(32).toString('hex'),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      network: network.name,
      domain: new URL(uri).host,
      uri
    };

    const session = await getAuthSession();
    delete session.address;
    delete session.network;
    delete session.authenticatedAt;
    session.challenge = challenge;
    await session.save();

    const response: AuthChallengeResponse = {
      appName: getAuthAppName(),
      nonce: challenge.nonce,
      domain: challenge.domain,
      uri: challenge.uri,
      network: network.label,
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expiresAt
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Auth challenge failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ message: 'Unable to create authentication challenge.' }, { status: 500 });
  }
}
