import { NextResponse } from 'next/server';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const entries = new Map<string, RateLimitEntry>();

function pruneExpired(now: number) {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) entries.delete(key);
  }
  if (entries.size > 10_000) {
    entries.delete(entries.keys().next().value as string);
  }
}

function getClientKey(request: Request): string | null {
  // Try Vercel header first (production)
  const vercelIp = request.headers.get('x-vercel-forwarded-for')?.trim();
  if (vercelIp) return vercelIp;

  // Fallback to standard proxy headers
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwardedFor) return forwardedFor;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return cloudflareIp;

  // Development fallback - allow local dev with static identifier
  if (process.env.NODE_ENV === 'development') {
    return 'localhost-dev';
  }

  // Fail closed in production if no valid IP found
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
      { code: 'RATE_LIMITED', message: 'Too many authentication requests. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((current.resetAt - now) / 1000)) }
      }
    );
  }

  current.count += 1;
  return null;
}
