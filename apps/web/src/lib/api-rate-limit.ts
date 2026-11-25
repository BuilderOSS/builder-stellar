import { NextResponse } from 'next/server';

import { enforceAuthRateLimit, getClientKey } from '@/lib/auth/rate-limit';

/**
 * Per-client limits for public routes that cost the operator RPC calls, IPFS fetches, image
 * work or database reads. Counted per IP address and per server instance, with the same
 * bookkeeping as sign-in (lib/auth/rate-limit.ts), so they stop one client hammering a route,
 * not a distributed flood.
 */
export const API_RATE_LIMITS = {
  /** Artwork composition: a gallery page loads one image per token, and crawlers read token images. CDN hits never count. */
  render: { limit: 300, windowMs: 60_000 },
  /** Transaction preparation (claims, marketplace, tokens, treasury): one simulation each. Room for a group on one network. */
  prepare: { limit: 60, windowMs: 60_000 },
  /** Claim state and history: chain reads and the claim list from IPFS. */
  claims: { limit: 120, windowMs: 60_000 },
  /** Health checks; the result is also cached for a few seconds. */
  health: { limit: 30, windowMs: 60_000 },
  /** Content-Security-Policy violation reports. */
  'csp-report': { limit: 30, windowMs: 60_000 }
} as const;

export type LimitedRoute = keyof typeof API_RATE_LIMITS;

export const RATE_LIMITED_MESSAGE = 'Too many requests. Wait a minute, then try again.';

/**
 * Count one request to `route`. Returns the response to send when the client is over its limit
 * (429 with Retry-After), or null to continue. The sign-in limiter's own 429 text is replaced,
 * since it speaks of sign-in.
 *
 * The client is identified exactly as sign-in identifies it (`getClientKey`: Vercel's
 * x-vercel-forwarded-for, or the header TRUSTED_CLIENT_IP_HEADER names). A request with no trusted
 * address, and local development, are let through uncounted, where sign-in refuses the former:
 * these routes are public reads and preparations, so they stay available, and the limits apply
 * wherever the platform supplies the address.
 */
export async function limitApiRequest(request: Request, route: LimitedRoute): Promise<Response | null> {
  const client = getClientKey(request);
  if (!client || client === 'localhost-dev') return null;
  const { limit, windowMs } = API_RATE_LIMITS[route];
  const blocked = await enforceAuthRateLimit(request, `api:${route}`, limit, windowMs);
  if (!blocked || blocked.status !== 429) return null;
  return NextResponse.json(
    { code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE },
    {
      status: 429,
      headers: { 'Retry-After': blocked.headers.get('Retry-After') ?? '60', 'Cache-Control': 'no-store' }
    }
  );
}
