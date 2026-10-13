/**
 * The largest share of the votes one wallet could reach from a pool: it buys its whole limit
 * and nobody else buys (membership-models § 4, the size warning).
 */
export function largestBuyerShare(votingSupply: bigint, size: string, maxPerBuyer: string) {
  const pool = Number(size);
  const limit = Number(maxPerBuyer);
  if (!Number.isInteger(pool) || !Number.isInteger(limit) || pool < 1 || limit < 1) return null;
  const bought = BigInt(Math.min(pool, limit));
  return { bought: Number(bought), percent: Number((bought * 10_000n) / (votingSupply + bought)) / 100 };
}
