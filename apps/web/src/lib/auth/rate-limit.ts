import { NextResponse } from 'next/server';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * Counts per client address, per scope. The counts live in this server instance's memory: each
 * instance counts on its own and starts again from zero when it restarts, so the limits slow a
 * client down rather than set a hard deployment-wide cap. There is no shared store.
 */
const entries = new Map<string, RateLimitEntry>();

function pruneExpired(now: number) {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }
  if (entries.size > 10_000) {
    entries.delete(entries.keys().next().value as string);
  }
}

/** Vercel's edge sets this header to the connecting client's address and overwrites any value the client sent. */
export const VERCEL_CLIENT_IP_HEADER = 'x-vercel-forwarded-for';

let warnedInvalidHeader = false;

/**
 * The one request header trusted to carry the client's address, or null when none is.
 *
 * A client can send any X-Forwarded-For, X-Real-IP or CF-Connecting-IP header, and nothing replaces
 * it unless a proxy in front of the app does. So the app trusts only a header the platform sets:
 * TRUSTED_CLIENT_IP_HEADER when the operator names one (the header their own proxy sets or
 * overwrites), otherwise Vercel's header on Vercel, otherwise none.
 */
export function trustedClientIpHeader(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configured) {
    if (/^[a-z0-9-]+$/.test(configured)) return configured;
    if (!warnedInvalidHeader) {
      warnedInvalidHeader = true;
      console.error('TRUSTED_CLIENT_IP_HEADER is not a header name; no client address header is trusted.');
    }
    return null;
  }
  return env.VERCEL === '1' ? VERCEL_CLIENT_IP_HEADER : null;
}

/** The rate-limit key for the request's client, or null when the client can't be identified. */
export function getClientKey(request: Request, env: NodeJS.ProcessEnv = process.env): string | null {
  const header = trustedClientIpHeader(env);
  if (header) {
    // A proxy appends the address it saw, so the last entry is the one it vouches for; any entries
    // before it came from the client.
    const address = request.headers.get(header)?.split(',').at(-1)?.trim();
    if (address) return address;
  }

  // Local development: every request comes from this machine.
  if (env.NODE_ENV === 'development') return 'localhost-dev';

  // Fail closed: without a trusted address, refuse rather than share one count across clients.
  return null;
}

export function enforceAuthRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  pruneExpired(now);
  const clientKey = getClientKey(request);
  if (!clientKey) {
    return NextResponse.json(
      { code: 'RATE_LIMIT_IDENTITY_UNAVAILABLE', message: 'Unable to identify the requesting client.' },
      { status: 503 }
    );
  }

  const key = `${scope}:${clientKey}`;
  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= limit) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', message: 'Too many sign-in requests. Try again in a few minutes.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((current.resetAt - now) / 1000)) }
      }
    );
  }

  current.count += 1;
  return null;
}
