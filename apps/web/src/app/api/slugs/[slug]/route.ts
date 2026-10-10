import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { isValidSlug } from '@/lib/create-dao-schema';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Slug availability from the index. A slug is taken only once a DAO launched
 * with it (claimed, permanent). Pending requests are not reservations: several
 * pending DAOs may request the same slug and the first to launch claims it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return NextResponse.json({ slug, valid: false, claimedBy: null, pendingRequests: 0 });
  try {
    const [claimed, pendingRequests] = await Promise.all([
      prisma.managerDao.findFirst({
        where: { deploymentId: DEPLOYMENT_ID, claimedSlug: slug },
        select: { daoId: true }
      }),
      prisma.managerDao.count({ where: { deploymentId: DEPLOYMENT_ID, slugClaimed: false, requestedSlug: slug } })
    ]);
    return NextResponse.json(
      { slug, valid: true, claimedBy: claimed?.daoId ?? null, pendingRequests },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { slug, valid: true, message: error instanceof Error ? error.message : 'Slug lookup unavailable' },
      { status: 503 }
    );
  }
}
