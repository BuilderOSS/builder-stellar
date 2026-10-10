import { treasuryFailure, treasuryResponse } from '@/lib/treasury-service/http';
import { indexedTreasuryHistory, TreasuryError, treasuryScope } from '@/lib/treasury-service/service';
import { treasuryPage } from '@/lib/treasury-service/values';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    let page: number;
    try {
      page = treasuryPage(new URL(request.url).searchParams);
    } catch {
      throw new TreasuryError('Invalid treasury history parameters.');
    }
    return treasuryResponse(await indexedTreasuryHistory(await treasuryScope((await params).daoId), page));
  } catch (error) {
    return treasuryFailure(error);
  }
}
