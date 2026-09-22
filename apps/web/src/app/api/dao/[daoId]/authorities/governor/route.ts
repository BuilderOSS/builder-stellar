import { NextResponse } from 'next/server';

import { getGoldskyGovernorAuthorities } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    return NextResponse.json(await getGoldskyGovernorAuthorities(daoId), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { items: [], total: 0, generatedAt: new Date().toISOString(), message: 'Governor authorities unavailable' },
      { status: 503 }
    );
  }
}
