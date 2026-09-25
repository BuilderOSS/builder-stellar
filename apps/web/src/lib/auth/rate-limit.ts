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

function getClientKey(request: Request) {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function enforceAuthRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  pruneExpired(now);
  const key = `${scope}:${getClientKey(request)}`;
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
