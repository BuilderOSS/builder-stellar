import { marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { MarketplaceError } from '@/lib/marketplace/query';
import { marketplaceComments, marketplaceDao } from '@/lib/marketplace/service';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const query = new URL(request.url).searchParams;
    const kind = query.get('kind');
    if (kind !== 'pool' && kind !== 'secondary') throw new MarketplaceError('Invalid listing type.', 400);
    const community = await marketplaceDao((await params).daoId);
    return marketplaceResponse(await marketplaceComments(community, kind, query.get('id') ?? ''));
  } catch (error) {
    return marketplaceFailure(error);
  }
}
