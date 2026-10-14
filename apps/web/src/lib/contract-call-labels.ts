/** Plain titles for common contract calls. The exact call is always shown alongside. */
const KNOWN_CALLS: Record<string, string> = {
  pause: 'Pause',
  unpause: 'Resume',
  upgrade: 'Upgrade a contract',
  migrate: 'Update contract storage',
  transfer: 'Send funds',
  mint: 'Mint a token',
  batch_mint: 'Mint tokens',
  set_metadata: 'Update the tribe profile',
  set_reserve_price: 'Change the starting price',
  set_duration: 'Change how long each auction runs',
  set_time_buffer: 'Change how much time a late bid adds',
  set_min_bid_increment: 'Change the minimum bid increase',
  set_payment_token: 'Change the payment asset',
  set_voting_delay: 'Change the wait before voting opens',
  set_voting_period: 'Change how long voting stays open',
  set_queue_delay: 'Change the safety delay',
  set_proposal_threshold: 'Change the votes needed to propose',
  set_quorum_bps: 'Change the quorum',
  create_module: 'Add a module to the tribe',
  register_module: 'Register a module with the membership token',
  unregister_module: 'Remove a module from the tribe'
};

export function contractCallLabel(functionName: string) {
  const known = KNOWN_CALLS[functionName];
  if (known) return known;
  const words = functionName.replace(/_/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : functionName;
}

/** Who a token mint gives tokens to, and how many each. */
export type MintGrant = { recipient: string; amount: bigint };

function mintAmount(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value) && BigInt(value) > 0n) return BigInt(value);
  return null;
}

/**
 * The grants in a Token `mint(minter, to)` or `batch_mint(minter, recipients, amounts)` call,
 * one per wallet in first-seen order. Null when the lists don't line up or an amount isn't
 * positive: the Token rejects those calls.
 */
export function mintGrants(functionName: string, args: unknown[]): MintGrant[] | null {
  if (functionName === 'mint') return typeof args[1] === 'string' ? [{ recipient: args[1], amount: 1n }] : null;
  if (functionName !== 'batch_mint') return null;
  const [, recipients, amounts] = args;
  if (!Array.isArray(recipients) || !Array.isArray(amounts)) return null;
  if (!recipients.length || recipients.length !== amounts.length) return null;
  const byRecipient = new Map<string, bigint>();
  for (const [index, recipient] of recipients.entries()) {
    const amount = mintAmount(amounts[index]);
    if (typeof recipient !== 'string' || amount === null) return null;
    byRecipient.set(recipient, (byRecipient.get(recipient) ?? 0n) + amount);
  }
  return [...byRecipient].map(([recipient, amount]) => ({ recipient, amount }));
}

/** "Mint 5 membership tokens to GABC…", or "… to 3 wallets" when it mints to several. */
export function mintTitle(grants: MintGrant[], formatAddress = (address: string) => address) {
  const total = grants.reduce((sum, grant) => sum + grant.amount, 0n);
  const tokens = total === 1n ? 'a membership token' : `${total.toLocaleString('en-US')} membership tokens`;
  const to = grants.length === 1 ? formatAddress(grants[0]!.recipient) : `${grants.length} wallets`;
  return `Mint ${tokens} to ${to}`;
}

/** "Add 2 new layers and 5 images to the artwork", for a Metadata `add_properties` call. */
export function artworkAdditionTitle(newLayers: number, images: number) {
  const parts = [
    newLayers ? `${newLayers} new ${newLayers === 1 ? 'layer' : 'layers'}` : null,
    `${images} ${images === 1 ? 'image' : 'images'}`
  ].filter(Boolean);
  return `Add ${parts.join(' and ')} to the artwork`;
}
