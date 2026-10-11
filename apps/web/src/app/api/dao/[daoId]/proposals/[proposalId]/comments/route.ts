import { NextResponse } from 'next/server';

import { getGoldskyProposalComments } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ daoId: string; proposalId: string }> }) {
  const { daoId, proposalId } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || offset < 0) {
    return NextResponse.json({ message: 'Invalid comment query parameters' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getGoldskyProposalComments(daoId, { proposalId, limit: Math.min(limit, 1000), offset }),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { items: [], generatedAt: new Date().toISOString(), message: 'Proposal comments unavailable' },
      { status: 503 }
    );
  }
}
