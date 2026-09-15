import { NextResponse } from 'next/server';

import { getGoldskyProposalVotes } from '@/lib/goldsky';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const supportValue = url.searchParams.get('support');
  const support = supportValue === null ? undefined : Number(supportValue);
  if (
    !Number.isInteger(limit) ||
    !Number.isInteger(offset) ||
    limit < 1 ||
    offset < 0 ||
    (support !== undefined && ![0, 1, 2].includes(support))
  ) {
    return NextResponse.json({ message: 'Invalid vote query parameters' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getGoldskyProposalVotes({ proposalId, limit: Math.min(limit, 1000), offset, support }),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        items: [],
        tally: { for: '0', against: '0', abstain: '0' },
        generatedAt: new Date().toISOString(),
        message: 'Proposal votes unavailable'
      },
      { status: 503 }
    );
  }
}
