import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

import { getNetworkConfig, type NetworkName } from '@/config/networks';

import type { AuthSession } from './types';

export const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const AUTH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const challengeClaims = new Map<string, { state: 'pending' | 'consumed'; expiresAt: number }>();

export class AuthError extends Error {
  constructor(
    public readonly code:
      | 'NO_CHALLENGE'
      | 'CHALLENGE_EXPIRED'
      | 'INVALID_MESSAGE'
      | 'INVALID_SIGNATURE'
      | 'NETWORK_MISMATCH'
      | 'DOMAIN_MISMATCH'
      | 'UNAUTHENTICATED',
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function getSessionPassword() {
  const password = process.env.IRON_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error('IRON_PASSWORD must be configured with at least 32 characters.');
  }
  return password;
}

export function getSessionOptions(): SessionOptions {
  return {
    cookieName: 'stellar-auth',
    password: getSessionPassword(),
    ttl: AUTH_SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_SESSION_TTL_SECONDS
    }
  };
}

export async function getAuthSession() {
  return getIronSession<AuthSession>(await cookies(), getSessionOptions());
}

export function getConfiguredNetwork() {
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as NetworkName;
  return getNetworkConfig(network);
}

export function getAuthOrigin(request: Request) {
  const configuredOrigin = process.env.APP_URL?.trim();
  if (configuredOrigin) {
    return new URL(configuredOrigin).origin;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL must be configured in production.');
  }

  return new URL(request.url).origin;
}

export function getAuthAppName() {
  return process.env.AUTH_APP_NAME?.trim() || 'Stellar DAOs';
}

function pruneChallengeClaims(now = Date.now()) {
  for (const [nonce, claim] of challengeClaims) {
    if (claim.expiresAt <= now) challengeClaims.delete(nonce);
  }
}

export function claimAuthChallenge(nonce: string, expiresAt: number) {
  pruneChallengeClaims();
  if (challengeClaims.has(nonce)) return false;
  challengeClaims.set(nonce, { state: 'pending', expiresAt });
  return true;
}

export function consumeAuthChallenge(nonce: string) {
  const claim = challengeClaims.get(nonce);
  if (claim) challengeClaims.set(nonce, { ...claim, state: 'consumed' });
}

export function releaseAuthChallenge(nonce: string) {
  const claim = challengeClaims.get(nonce);
  if (claim?.state === 'pending') challengeClaims.delete(nonce);
}

export async function requireAuthenticatedSession() {
  const session = await getAuthSession();
  if (!session.address || !session.network) {
    throw new AuthError('UNAUTHENTICATED', 'Authentication is required.');
  }
  return { address: session.address, network: session.network };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : 422;
    return Response.json({ code: error.code, message: error.message }, { status });
  }

  return Response.json({ message: 'Authentication service unavailable.' }, { status: 500 });
}
