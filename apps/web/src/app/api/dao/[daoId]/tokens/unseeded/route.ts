import { NextResponse } from 'next/server';

import { directoryScope } from '@/lib/member-directory/query';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Minted tokens with no indexed artwork seed (minted before any artwork existed,
 * so the Metadata hook seeded nothing). They can be seeded with
 * metadata.regenerate. Indexed data: the client rechecks on-chain before acting.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    const scope = await directoryScope(daoId);
    const rows = await prisma.$queryRaw<{ token_id: string }[]>`
      SELECT inv.token_id::text
      FROM token.inventory inv
      WHERE inv.deployment_id = ${scope.deploymentId} AND inv.dao_id = ${scope.daoId}
        AND inv.contract_id = ${scope.daoId}
        AND NOT EXISTS (
          SELECT 1 FROM metadata.token_seeds s
          WHERE s.deployment_id = inv.deployment_id AND s.dao_id = inv.dao_id AND s.token_id = inv.token_id
        )
      ORDER BY inv.token_id
      LIMIT 101`;
    return NextResponse.json(
      {
        tokenIds: rows.slice(0, 100).map((row) => row.token_id),
        hasMore: rows.length > 100,
        generatedAt: new Date().toISOString()
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { tokenIds: [], message: error instanceof Error ? error.message : 'Unseeded tokens unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
