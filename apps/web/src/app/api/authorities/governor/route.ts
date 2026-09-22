import { NextResponse } from 'next/server';

import { getGoldskyGovernorAuthorities } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const daoId = new URL(request.url).searchParams.get('daoId');
    if (!daoId) return NextResponse.json({ message: 'daoId is required' }, { status: 400 });
    return NextResponse.json(await getGoldskyGovernorAuthorities(daoId), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), message: 'Governor authorities unavailable' },
      { status: 503 }
    );
  }
}
