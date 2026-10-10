import { getDeploymentConfig } from '@/lib/deployment-config';
import { marketplaceActor, marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { MarketplaceError } from '@/lib/marketplace/query';
import { marketplaceReadiness } from '@/lib/marketplace/readiness';
import { marketplaceDao } from '@/lib/marketplace/service';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const actor = await marketplaceActor();
    const community = await marketplaceDao((await params).daoId);
    const asset = new URL(request.url).searchParams.get('asset');
    if (!asset || asset.length !== 56) throw new MarketplaceError('Payment asset is required.', 400);
    return marketplaceResponse({
      ...(await marketplaceReadiness(actor.address, getDeploymentConfig().name, asset)),
      deploymentId: community.deploymentId,
      daoId: community.daoId
    });
  } catch (error) {
    return marketplaceFailure(error);
  }
}
