import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { marketplaceActor, marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { MARKETPLACE_MAX_PAGE, MarketplaceError, parseMarketplaceQuery } from '@/lib/marketplace/query';
import { marketplaceDao } from '@/lib/marketplace/service';
import type { MarketplaceInventory } from '@/lib/marketplace/types';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const actor = await marketplaceActor();
    const community = await marketplaceDao((await params).daoId);
    const { page } = parseMarketplaceQuery(new URL(request.url).searchParams);
    const rows = await prisma.tokenInventory.findMany({
      where: {
        deploymentId: DEPLOYMENT_ID,
        daoId: community.daoId,
        contractId: community.tokenContract,
        owner: actor.address
      },
      orderBy: [{ tokenId: 'asc' }, { eventId: 'asc' }],
      skip: page * 24,
      take: 25
    });
    if (
      rows.some(
        (row) =>
          row.deploymentId !== DEPLOYMENT_ID ||
          row.daoId !== community.daoId ||
          row.contractId !== community.tokenContract ||
          row.owner !== actor.address
      )
    ) {
      throw new MarketplaceError('Indexed inventory identity does not match this account and community.', 503);
    }
    const response: MarketplaceInventory = {
      deploymentId: DEPLOYMENT_ID,
      daoId: community.daoId,
      address: actor.address,
      tokenIds: rows.slice(0, 24).map((r) => r.tokenId.toString()),
      hasMore: page < MARKETPLACE_MAX_PAGE && rows.length > 24
    };
    return marketplaceResponse(response);
  } catch (error) {
    return marketplaceFailure(error);
  }
}
