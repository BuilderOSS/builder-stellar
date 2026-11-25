import { NextResponse } from 'next/server';

import { limitApiRequest } from '@/lib/api-rate-limit';
import { getGoldskyHealth } from '@/lib/goldsky';
import { cached } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

/** A public database read: rate limited per client, and one result is shared for 10 seconds. */
export async function GET(request: Request) {
  const limited = await limitApiRequest(request, 'health');
  if (limited) return limited;
  const health = await cached('api:goldsky-health', 10_000, getGoldskyHealth);
  return NextResponse.json(health, {
    status: health.status === 'healthy' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}
