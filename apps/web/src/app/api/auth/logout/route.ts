import { NextResponse } from 'next/server';

import { enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { getAuthSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rateLimitResponse = enforceAuthRateLimit(request, 'logout', 60);
  if (rateLimitResponse) return rateLimitResponse;

  const session = await getAuthSession();
  session.destroy();
  return NextResponse.json({ authenticated: false, address: null }, { headers: { 'Cache-Control': 'no-store' } });
}
