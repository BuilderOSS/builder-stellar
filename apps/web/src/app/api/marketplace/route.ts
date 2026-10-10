import { marketplaceFailure, marketplaceResponse } from '@/lib/marketplace/http';
import { marketplaceDirectory } from '@/lib/marketplace/service';

export async function GET(request: Request) {
  try {
    return marketplaceResponse(await marketplaceDirectory(new URL(request.url).searchParams));
  } catch (error) {
    return marketplaceFailure(error);
  }
}
