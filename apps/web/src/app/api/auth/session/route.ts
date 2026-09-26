import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { getAuthSession } from '@/lib/auth/server';
import type { AuthSessionResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'session', 120);
  if (rateLimitResponse) return rateLimitResponse;

  const session = await getAuthSession();
  const response: AuthSessionResponse = {
    authenticated: Boolean(session.address && session.network),
    address: session.address ?? null,
    authMethod: session.authMethod ?? null
  };

  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
}
