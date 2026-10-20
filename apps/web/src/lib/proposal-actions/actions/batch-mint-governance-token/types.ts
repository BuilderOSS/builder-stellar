export type MintAllocation = { recipient: string; amount: string };
export type BatchMintGovernanceTokenData = MintAllocation & { allocations?: MintAllocation[] };

export function batchMintEntries(data: BatchMintGovernanceTokenData): MintAllocation[] {
  return data.allocations?.length ? data.allocations : [{ recipient: data.recipient, amount: data.amount }];
}
