import { marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { marketplaceOffers } from '@/lib/marketplace/service';

export async function GET(request: Request) {
  try {
    return marketplaceResponse(await marketplaceOffers(new URL(request.url).searchParams));
  } catch (error) {
    return marketplaceFailure(error);
  }
}
