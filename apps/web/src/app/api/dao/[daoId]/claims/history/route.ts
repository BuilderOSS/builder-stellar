import { NextResponse } from 'next/server';

import { claimHistory } from '@/lib/minter/service';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  const value = new URL(request.url).searchParams.get('offset') ?? '0';
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100000)
    return NextResponse.json({ message: 'Invalid history offset.' }, { status: 400, headers });
  try {
    return NextResponse.json(await claimHistory((await params).daoId, Number(value)), { headers });
  } catch {
    return NextResponse.json(
      { message: "Claim history is unavailable. Past claims don't show whether you can claim in the current round." },
      { status: 503, headers }
    );
  }
}
