const votes = (n: bigint) => `${n} ${n === 1n ? 'vote' : 'votes'}`;
const tokens = (n: bigint) => `${n} more founder ${n === 1n ? 'token' : 'tokens'}`;

/**
 * Warns when the votes members hold (the token's voting supply, plus any founder tokens about to
 * be minted) stay below the Governor's proposal threshold. Launch still succeeds, and the Governor
 * then caps the threshold at the supply, so a proposal needs every vote in one wallet (held or
 * delegated). Null when there is nothing to warn about or the threshold is unknown.
 */
export function proposalThresholdWarning({
  supply,
  threshold,
  adding = 0n
}: {
  supply: bigint | null | undefined;
  threshold: bigint | null | undefined;
  /** Founder tokens in the mint being prepared; each one is a vote. */
  adding?: bigint;
}): string | null {
  if (supply === null || supply === undefined || threshold === null || threshold === undefined) return null;
  const after = supply + adding;
  if (after >= threshold) return null;
  const held = adding > 0n ? `After this mint, members hold ${votes(after)}` : `Members hold ${votes(after)}`;
  return `A proposal needs ${votes(threshold)}. ${held}, so a proposal would need every vote, held by or delegated to one wallet. Mint ${tokens(threshold - after)}, or lower the proposal threshold in Voting rules.`;
}
