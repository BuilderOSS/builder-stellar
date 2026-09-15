import { NextResponse } from 'next/server';

import { getGoldskyMintAuthorities } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getGoldskyMintAuthorities(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), message: 'Mint authorities unavailable' },
      { status: 503 }
    );
  }
}
