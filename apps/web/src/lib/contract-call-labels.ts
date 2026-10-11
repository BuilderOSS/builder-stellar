/** Plain titles for common contract calls. The exact call is always shown alongside. */
const KNOWN_CALLS: Record<string, string> = {
  pause: 'Pause',
  unpause: 'Resume',
  upgrade: 'Upgrade a contract',
  migrate: 'Update contract storage',
  transfer: 'Send funds',
  mint: 'Mint a token',
  batch_mint: 'Mint tokens',
  set_metadata: 'Update the community profile',
  set_reserve_price: 'Change the starting price',
  set_duration: 'Change how long each auction runs',
  set_time_buffer: 'Change how much time a late bid adds',
  set_min_bid_increment: 'Change the minimum bid increase',
  set_payment_token: 'Change the payment asset',
  set_voting_delay: 'Change the wait before voting opens',
  set_voting_period: 'Change how long voting stays open',
  set_queue_delay: 'Change the safety delay',
  set_proposal_threshold: 'Change the votes needed to propose',
  set_quorum_bps: 'Change the quorum'
};

export function contractCallLabel(functionName: string) {
  const known = KNOWN_CALLS[functionName];
  if (known) return known;
  const words = functionName.replace(/_/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : functionName;
}
