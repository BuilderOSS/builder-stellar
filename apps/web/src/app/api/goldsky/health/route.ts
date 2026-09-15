import { NextResponse } from 'next/server';

import { getGoldskyHealth } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getGoldskyHealth();
  return NextResponse.json(health, {
    status: health.status === 'healthy' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}
