/** Which of the tribe's contracts a call goes to. Labels depend on it: auction `pause` is not market `pause`. */
export type ContractRole =
  'token' | 'governor' | 'treasury' | 'auction' | 'marketplace' | 'metadata' | 'claims' | 'manager';

/**
 * The composer's words for each call, by contract. Every proposal action's handler label appears here, so a
 * change reads the same in the composer, the dock and on the proposal page (contract-call-labels.test.ts).
 */
const ROLE_CALLS: Record<ContractRole, Record<string, string>> = {
  token: {
    mint: 'Mint a membership token',
    batch_mint: 'Mint membership tokens',
    transfer: 'Give a treasury token',
    transfer_from: 'Approve a membership transfer',
    increase_mint_allowance: 'Change a mint allowance',
    decrease_mint_allowance: 'Change a mint allowance',
    set_transfers_locked: 'Lock memberships',
    set_members_only_delegation: 'Members-only delegation',
    set_dao_recovery: 'DAO recovery',
    set_transfer_agent: 'Change a transfer agent',
    dao_transfer: 'Recover a membership',
    register_module: 'Register a module',
    unregister_module: 'Remove a module',
    set_metadata: 'Rename the tribe'
  },
  governor: {
    set_voting_delay: 'Change the wait before voting opens',
    set_voting_period: 'Change how long voting stays open',
    set_queue_delay: 'Change the safety delay',
    set_proposal_threshold: 'Change the votes needed to propose',
    set_quorum_bps: 'Change the quorum'
  },
  treasury: { authorize: 'Authorize the next action (Treasury)' },
  auction: {
    pause: 'Pause auctions',
    unpause: 'Resume auctions',
    set_reserve_price: 'Change the starting price',
    set_duration: 'Change how long each auction runs',
    set_time_buffer: 'Change how much time a late bid adds',
    set_min_bid_increment: 'Change the minimum bid increase',
    set_payment_token: 'Change the auction payment asset',
    cancel_auction: 'Cancel the current auction'
  },
  marketplace: {
    pause: 'Pause the market',
    unpause: 'Reopen the market',
    set_payment_asset: 'Change the market payment asset',
    set_secondary_fee_bps: 'Change the resale fee',
    open_pool: 'Open a quick-buy pool',
    close_pool: 'Close a pool',
    sweep_pool: 'Sweep a closed pool',
    buy: 'Buy a listing for the treasury'
  },
  metadata: {
    add_properties: 'Add artwork layers',
    update_renderer_base: 'Change the artwork renderer',
    update_profile: 'Update the tribe profile',
    regenerate: 'Seed traits for a token'
  },
  claims: { open_list: 'Open a claim list' },
  manager: { create_module: 'Add a module', change_slug: 'Change the tribe link' }
};

/** Titles for calls whose contract isn't known: same-named calls on other contracts read generically. */
const KNOWN_CALLS: Record<string, string> = {
  ...ROLE_CALLS.manager,
  ...ROLE_CALLS.claims,
  ...ROLE_CALLS.metadata,
  ...ROLE_CALLS.marketplace,
  ...ROLE_CALLS.auction,
  ...ROLE_CALLS.treasury,
  ...ROLE_CALLS.governor,
  ...ROLE_CALLS.token,
  pause: 'Pause',
  unpause: 'Resume',
  // A bare `transfer` is usually a treasury payment; the Token's own reads as a gift once its role is known.
  transfer: 'Send funds',
  upgrade: 'Upgrade a module',
  migrate: 'Migrate module storage'
};

/** The plain title for a call, in the composer's words; `role` tells same-named calls apart. */
export function contractCallLabel(functionName: string, role?: ContractRole) {
  const known = (role ? ROLE_CALLS[role][functionName] : undefined) ?? KNOWN_CALLS[functionName];
  if (known) return known;
  const words = functionName.replace(/_/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : functionName;
}

/** Which tribe contract an address is, from its config. */
export function contractRole(
  target: string,
  config: Partial<
    Record<
      | 'tokenContractId'
      | 'governorContractId'
      | 'treasuryContractId'
      | 'auctionContractId'
      | 'marketplaceContractId'
      | 'metadataContractId'
      | 'claimsContractId',
      string
    >
  >,
  managerAddress?: string
): ContractRole | undefined {
  if (!target) return undefined;
  if (target === config.tokenContractId) return 'token';
  if (target === config.governorContractId) return 'governor';
  if (target === config.treasuryContractId) return 'treasury';
  if (target === config.auctionContractId) return 'auction';
  if (target === config.marketplaceContractId) return 'marketplace';
  if (target === config.metadataContractId) return 'metadata';
  if (target === config.claimsContractId) return 'claims';
  if (managerAddress && target === managerAddress) return 'manager';
  return undefined;
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
