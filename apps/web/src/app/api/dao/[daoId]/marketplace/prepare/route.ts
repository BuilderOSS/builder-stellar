import { marketplaceActionSchema, prepareMarketplaceAction } from '@/lib/marketplace/actions';
import {
  marketplaceActor,
  marketplaceResponse,
  marketplaceSameOrigin,
  marketplaceTradeFailure
} from '@/lib/marketplace/http';
import { MarketplaceError } from '@/lib/marketplace/query';

export async function POST(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    marketplaceSameOrigin(request);
    const actor = await marketplaceActor();
    const text = await request.text();
    if (text.length > 4096) throw new MarketplaceError('Marketplace request is too large.', 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new MarketplaceError('Invalid JSON request.', 400);
    }
    const action = marketplaceActionSchema.parse(body);
    return marketplaceResponse(await prepareMarketplaceAction((await params).daoId, actor, action));
  } catch (error) {
    return marketplaceTradeFailure(error);
  }
}
