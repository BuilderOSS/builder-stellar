import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { getAuthSession, rejectCrossSiteRequest } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/**
 * Signs out by clearing the session cookie in this browser. Sessions are stateless sealed cookies,
 * so a copy of the cookie taken earlier stays valid until its idle or absolute limit. Ending every
 * session at once means replacing IRON_PASSWORD with a new secret under a new number and no old
 * ones (see lib/auth/secrets.ts).
 */
export async function POST(request: Request) {
  const crossSite = rejectCrossSiteRequest(request);
  if (crossSite) return crossSite;
  const rateLimitResponse = enforceAuthRateLimit(request, 'logout', 60);
  if (rateLimitResponse) return rateLimitResponse;

  const session = await getAuthSession();
  session.destroy();
  return NextResponse.json({ authenticated: false, address: null }, { headers: { 'Cache-Control': 'no-store' } });
}
