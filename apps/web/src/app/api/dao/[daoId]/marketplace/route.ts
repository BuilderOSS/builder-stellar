import { marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { daoMarketplace } from '@/lib/marketplace/service';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    return marketplaceResponse(await daoMarketplace((await params).daoId, new URL(request.url).searchParams));
  } catch (error) {
    return marketplaceFailure(error);
  }
}
