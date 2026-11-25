import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { getAuthSession, refreshAuthSession } from '@/lib/auth/server';
import type { AuthSessionResponse } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

/**
 * Who this browser is signed in as. A live session's idle limit starts again (the app calls this
 * on load); a session past its absolute limit reads as signed out.
 */
export async function GET(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'session', 120);
  if (rateLimitResponse) return rateLimitResponse;

  const session = await getAuthSession();
  const authenticated = Boolean(session.address && session.network);
  if (authenticated) await refreshAuthSession(session);
  const response: AuthSessionResponse = {
    authenticated,
    address: authenticated ? (session.address ?? null) : null,
    authMethod: authenticated ? (session.authMethod ?? null) : null
  };

  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
}
