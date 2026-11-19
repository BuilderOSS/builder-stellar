import { marketplaceApproval } from '@/lib/marketplace/actions';
import { marketplaceActor, marketplaceResponse, marketplaceTradeFailure } from '@/lib/marketplace/http';

/** The signed-in holder's live permission for the market to move one token (read on chain). */
export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const actor = await marketplaceActor();
    const tokenId = new URL(request.url).searchParams.get('tokenId') ?? '';
    return marketplaceResponse(await marketplaceApproval((await params).daoId, actor, tokenId));
  } catch (error) {
    return marketplaceTradeFailure(error);
  }
}
