import { NextResponse } from 'next/server';

import { getGoldskyGovernorAuthorities } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getGoldskyGovernorAuthorities(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), message: 'Governor authorities unavailable' },
      { status: 503 }
    );
  }
}
