import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';

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

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * A request from the server's own machine: `next dev` and `next start` set x-forwarded-for from
 * the socket when no proxy did, so local development and the walkthrough suite arrive as loopback.
 * Vercel always sends x-vercel-forwarded-for, which this never treats as local.
 */
function fromThisMachine(request: Request) {
  if (request.headers.get('x-vercel-forwarded-for')?.trim()) return false;
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first !== undefined && LOOPBACK.has(first);
}

/**
 * Count one request to `route`. Returns the response to send when the client is over its limit
 * (429 with Retry-After), or null to continue. The sign-in limiter's own 429 text is replaced,
 * since it speaks of sign-in.
 *
 * Requests from this machine, and requests with no client address, are let through uncounted
 * (sign-in refuses the latter). On Vercel neither happens. Elsewhere the forwarded-for header
 * comes from the client unless a proxy sets it, so a client could forge either case anyway; the
 * deployment's proxy has to supply the address for these limits to hold there.
 */
export async function limitApiRequest(request: Request, route: LimitedRoute): Promise<Response | null> {
  if (fromThisMachine(request)) return null;
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
