import { prepareTreasuryFunding } from '@/lib/treasury-service/funding';
import { treasuryActor, treasuryFailure, treasuryResponse, treasurySameOrigin } from '@/lib/treasury-service/http';
import { TreasuryError } from '@/lib/treasury-service/service';
import { fundingSchema } from '@/lib/treasury-service/values';

export async function POST(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  try {
    treasurySameOrigin(request);
    const actor = await treasuryActor();
    if (new URL(request.url).search) throw new TreasuryError('Preparation does not accept query parameters.');
    const text = await request.text();
    if (text.length > 4096) throw new TreasuryError('Treasury request is too large.', 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new TreasuryError('Invalid JSON request.');
    }
    const input = fundingSchema.parse(body);
    return treasuryResponse(await prepareTreasuryFunding((await params).daoId, actor, input));
  } catch (error) {
    return treasuryFailure(error);
  }
}
