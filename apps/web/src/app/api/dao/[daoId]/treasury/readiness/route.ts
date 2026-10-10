import { treasuryReadiness } from '@/lib/treasury-service/funding';
import { treasuryActor, treasuryFailure, treasuryResponse } from '@/lib/treasury-service/http';
import { TreasuryError } from '@/lib/treasury-service/service';
import { fundingAssetSchema } from '@/lib/treasury-service/values';

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => key !== 'assetCode') || query.getAll('assetCode').length !== 1)
      throw new TreasuryError('Only one assetCode parameter is supported.');
    const code = fundingAssetSchema.parse(query.get('assetCode'));
    return treasuryResponse(await treasuryReadiness((await params).daoId, await treasuryActor(), code));
  } catch (error) {
    return treasuryFailure(error);
  }
}
