import { NextResponse } from 'next/server';

import { directoryScope } from '@/lib/member-directory/query';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Current Governor configuration from governance.settings (constructor values + latest setter events). */
export async function GET(_request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const { daoId } = await params;
    const scope = await directoryScope(daoId);
    const row = await prisma.governanceSettings.findFirst({
      where: { deploymentId: scope.deploymentId, daoId: scope.daoId, governorContract: scope.config.governorContractId }
    });
    if (!row) return NextResponse.json({ settings: null }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(
      {
        settings: {
          admin: row.admin,
          votingDelay: row.votingDelaySeconds === null ? null : Number(row.votingDelaySeconds),
          votingPeriod: row.votingPeriodSeconds === null ? null : Number(row.votingPeriodSeconds),
          queueDelay: row.queueDelaySeconds === null ? null : Number(row.queueDelaySeconds),
          proposalThreshold: row.proposalThreshold === null ? null : row.proposalThreshold.toFixed(0),
          quorumBps: row.quorumBps,
          version: row.version,
          updatedLedger: row.updatedLedger === null ? null : Number(row.updatedLedger)
        }
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { settings: null, message: error instanceof Error ? error.message : 'Governance settings unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
