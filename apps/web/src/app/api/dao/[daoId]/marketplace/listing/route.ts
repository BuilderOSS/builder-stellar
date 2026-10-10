import { marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { MarketplaceError } from '@/lib/marketplace/query';
import { marketplaceDao, marketplaceListing } from '@/lib/marketplace/service';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const query = new URL(request.url).searchParams;
    const kind = query.get('kind');
    if (kind !== 'primary' && kind !== 'secondary') throw new MarketplaceError('Invalid listing type.', 400);
    const community = await marketplaceDao((await params).daoId);
    return marketplaceResponse({
      deploymentId: community.deploymentId,
      daoId: community.daoId,
      listing: await marketplaceListing(community, kind, query.get('id') ?? '', query.get('eventId') ?? '')
    });
  } catch (error) {
    return marketplaceFailure(error);
  }
}
