import { Keypair } from '@stellar/stellar-sdk';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getNetworkConfig, type NetworkName } from '@/config/networks';
import { SITE_NAME } from '@/lib/site';

import { getSessionPasswords } from './secrets';
import type { AuthSession } from './types';

export const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/**
 * Idle limit: a session ends this long after its cookie was last issued. Sign-in issues it, and the
 * app's session check on each page load re-issues it (at most once per AUTH_SESSION_REFRESH_MS), so
 * a session in use keeps going and an abandoned one ends.
 */
export const AUTH_SESSION_IDLE_SECONDS = 24 * 60 * 60;
/** Absolute limit: a session ends this long after sign-in, however often it is used. */
export const AUTH_SESSION_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;
/** An active session's cookie is re-issued at most this often, so not every request writes one. */
export const AUTH_SESSION_REFRESH_MS = 15 * 60 * 1000;
export const SEP10_CHALLENGE_TTL_SECONDS = 5 * 60;

/** Server clocks differ slightly between instances; a sign-in time this far ahead still counts. */
const CLOCK_SKEW_MS = 60 * 1000;
const SESSION_COOKIE = 'stellar-auth';

/**
 * Challenges being verified or already used, so one challenge signs in once. This is in the memory
 * of one server instance: another instance doesn't see it. Sign-in also deletes the challenge from
 * the session cookie it returns, so replaying a challenge means replaying the older cookie, within
 * the challenge's 5 minutes, to a different instance. There is no shared store.
 */
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
      | 'INSUFFICIENT_SIGNER_WEIGHT'
      | 'UNAUTHENTICATED',
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** The session cookie's name. Only a Secure cookie may carry the `__Host-` prefix. */
export function sessionCookieName(secure: boolean) {
  return secure ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}

/** iron-session options for the sign-in cookie, read from the environment on each call. */
export function getSessionOptions(): SessionOptions {
  const secure = process.env.NODE_ENV === 'production';
  return {
    // With `__Host-`, browsers accept the cookie only when it is Secure, has no Domain and has Path
    // `/`, so a sibling subdomain or a plain-HTTP response can't set or shadow the session. Browsers
    // allow Secure cookies only over HTTPS and on localhost, so development keeps the bare name.
    cookieName: sessionCookieName(secure),
    // A map of numbered secrets, so IRON_PASSWORD can be rotated (see ./secrets).
    password: getSessionPasswords(),
    // iron-session seals this expiry into the cookie and refuses the cookie after it, so a stolen
    // cookie stops working once the session has been idle this long, even if the browser keeps it.
    ttl: AUTH_SESSION_IDLE_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_SESSION_IDLE_SECONDS
    }
  };
}

/** Drop the signed-in account from a session (in memory; a later `save` writes it). */
export function clearSessionAccount(session: AuthSession) {
  delete session.address;
  delete session.network;
  delete session.authMethod;
  delete session.authenticatedAt;
  delete session.refreshedAt;
}

/** Whether a signed-in session is still within AUTH_SESSION_MAX_AGE_SECONDS of its sign-in. */
export function withinSessionLifetime(session: AuthSession, now = Date.now()) {
  const signedInAt = session.authenticatedAt;
  return (
    typeof signedInAt === 'number' &&
    Number.isFinite(signedInAt) &&
    signedInAt <= now + CLOCK_SKEW_MS &&
    now - signedInAt < AUTH_SESSION_MAX_AGE_SECONDS * 1000
  );
}

/**
 * The visitor's session. A session past its absolute lifetime reads as signed out here, for every
 * caller, because re-issuing the cookie only ever extends the idle limit.
 */
export async function getAuthSession() {
  const session = await getIronSession<AuthSession>(await cookies(), getSessionOptions());
  if (session.address && !withinSessionLifetime(session)) clearSessionAccount(session);
  return session;
}

/** Mark a session as signed in to `address` from now on. The caller saves it. */
export function startSessionAccount(
  session: AuthSession,
  account: { address: string; network: string; authMethod: NonNullable<AuthSession['authMethod']> },
  now = Date.now()
) {
  delete session.challenge;
  session.address = account.address;
  session.network = account.network;
  session.authMethod = account.authMethod;
  session.authenticatedAt = now;
  session.refreshedAt = now;
}

/**
 * Re-issue a signed-in session's cookie so its idle limit starts again (sliding expiry), at most
 * once per AUTH_SESSION_REFRESH_MS. The absolute limit is unchanged. Only `GET /api/auth/session`
 * calls this. A response to a request sent before a logout can restore the cookie, so the refresh
 * stays on that one route, which the app calls on page load, and not on routes it polls.
 */
export async function refreshAuthSession(session: IronSession<AuthSession>, now = Date.now()) {
  if (!session.address) return;
  const last = session.refreshedAt;
  if (typeof last === 'number' && last <= now + CLOCK_SKEW_MS && now - last < AUTH_SESSION_REFRESH_MS) return;
  session.refreshedAt = now;
  await session.save();
}

function isSameOriginRequest(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  // A sibling subdomain (dev.tribes.build next to tribes.build) is same-site and gets the Lax
  // cookie, so only the app's own pages count.
  if (site) return site === 'same-origin';
  // Browsers without Fetch Metadata still send Origin on a POST.
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return origin === getAuthOrigin(request);
  } catch {
    return false;
  }
}

/**
 * Refuse a sign-in request that another page started. These routes change who is signed in, so a
 * form post from another site, or from a sibling subdomain, could otherwise replace or clear a
 * visitor's session and sign them out. A request with neither Sec-Fetch-Site nor Origin is not
 * from a browser page, so it carries no visitor's cookie.
 */
export function rejectCrossSiteRequest(request: Request) {
  if (isSameOriginRequest(request)) return null;
  return NextResponse.json(
    { code: 'CROSS_SITE_REQUEST', message: 'Sign-in requests must come from this site.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
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
  return process.env.AUTH_APP_NAME?.trim() || SITE_NAME;
}

export function getSep10ServerKeypair() {
  const secret = process.env.STELLAR_WEB_AUTH_SECRET?.trim();
  if (!secret) throw new Error('STELLAR_WEB_AUTH_SECRET must be configured for SEP-10 authentication.');

  try {
    return Keypair.fromSecret(secret);
  } catch {
    throw new Error('STELLAR_WEB_AUTH_SECRET is not a valid Stellar secret key.');
  }
}

export function getSep10Domains(request: Request) {
  const requestHost = new URL(getAuthOrigin(request)).hostname;
  const homeDomain = process.env.STELLAR_HOME_DOMAIN?.trim() || requestHost;
  const webAuthDomain = process.env.STELLAR_WEB_AUTH_DOMAIN?.trim() || requestHost;
  if (!homeDomain || !webAuthDomain) throw new Error('SEP-10 domains must be configured.');
  return { homeDomain, webAuthDomain };
}

function pruneChallengeClaims(now = Date.now()) {
  for (const [nonce, claim] of challengeClaims) {
    if (claim.expiresAt <= now) challengeClaims.delete(nonce);
  }
}

export function claimAuthChallenge(nonce: string, expiresAt: number) {
  pruneChallengeClaims();
  const existing = challengeClaims.get(nonce);
  if (existing) {
    return {
      success: false as const,
      reason: existing.state === 'consumed' ? ('consumed' as const) : ('in-use' as const)
    };
  }
  challengeClaims.set(nonce, { state: 'pending', expiresAt });
  return { success: true as const };
}

export function consumeAuthChallenge(nonce: string) {
  const claim = challengeClaims.get(nonce);
  if (claim) challengeClaims.set(nonce, { ...claim, state: 'consumed' });
}

export function releaseAuthChallenge(nonce: string) {
  const claim = challengeClaims.get(nonce);
  if (claim?.state === 'pending') challengeClaims.delete(nonce);
}

/** The signed-in account, for routes that act for it. Throws UNAUTHENTICATED without a live session. */
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
    return NextResponse.json({ code: error.code, message: error.message }, { status });
  }

  return NextResponse.json({ message: 'Authentication service unavailable.' }, { status: 500 });
}
