/**
 * The "before you remove it" checklist (docs/designs/module-attach-ui.md § 4). Warnings never block
 * the sheet. The Token refuses to remove a module that holds memberships without votes while it holds
 * any (7222, ModuleHoldsTokens), so those rows say the removal fails until the module is empty. Rows
 * are plain data so the rules can be tested without the chain.
 */
import { holdsWithoutVotes, type ModuleKind, UNLIMITED_ALLOWANCE } from './kinds';
import type { PoolState } from './plans';

export type ModuleFacts = {
  kind: ModuleKind;
  /** `token.mint_allowance(module)`. */
  allowance: number;
  /** `token.balance(module)`: memberships it holds right now. */
  balance: number;
  /** `token.get_votes(module)`: votes it holds, its own and delegated to it. */
  votes: bigint;
  transferAgent: boolean;
  /** The market's pools; empty for other kinds. */
  pools: PoolState[];
  /** Open resale listings; null when the index could not be read. */
  openListings: number | null;
  /** An auction exists and has not settled. */
  auctionRunning: boolean;
  /** Claim lists still open for claims; null when they could not be read. */
  openLists: number | null;
};

export type ReadinessRow = {
  id: 'allowance' | 'holds' | 'votes' | 'listings' | 'auction' | 'lists' | 'agent';
  tone: 'ok' | 'warn';
  title: string;
  detail: string;
  /** The clean-up the plan can add for this row. */
  cleanup?: 'pools' | 'auction';
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Whether the chosen clean-up leaves the module holding nothing, which the Token requires before it
 * removes a module without votes. A token no pool or running auction accounts for (an open listing, or
 * one sent to the module directly) needs a step the plan cannot add, so the answer is then false.
 */
export function planEmptiesModule(facts: ModuleFacts, choices: { sweep: boolean; cancel: boolean }): boolean {
  if (!holdsWithoutVotes(facts.kind)) return true;
  if (facts.balance === 0) return true;
  if (facts.kind === 'auction') return facts.auctionRunning && choices.cancel && facts.balance === 1;
  if (facts.kind === 'marketplace') {
    if (facts.openListings !== 0 || !choices.sweep) return false;
    const pooled = facts.pools.reduce((sum, pool) => sum + pool.inStock, 0);
    return facts.balance === pooled;
  }
  return false;
}

export function moduleReadiness(facts: ModuleFacts): ReadinessRow[] {
  const rows: ReadinessRow[] = [];
  rows.push({
    id: 'allowance',
    tone: 'ok',
    title: 'Mint allowance goes to zero',
    detail:
      facts.allowance >= UNLIMITED_ALLOWANCE
        ? 'It has no limit now. Removing it clears this for you.'
        : `It has ${facts.allowance.toLocaleString()} left. Removing it clears this for you.`
  });

  const poolsToClean = facts.pools.filter((pool) => pool.open || pool.inStock > 0);
  // A module without votes must be empty to be removed; a voting module keeps what it holds.
  const heldDetail = holdsWithoutVotes(facts.kind)
    ? 'The removal fails while it holds any. Add the clean-up steps first.'
    : 'If they stay with the contract, their votes belong to it and no one can cast them. They still count toward quorum.';
  if (facts.kind === 'marketplace' && poolsToClean.length)
    rows.push({
      id: 'holds',
      tone: 'warn',
      title: `Holds ${plural(
        poolsToClean.reduce((sum, pool) => sum + pool.inStock, 0),
        'membership',
        'memberships'
      )} in ${plural(poolsToClean.length, 'pool', 'pools')}`,
      detail: heldDetail,
      cleanup: 'pools'
    });
  else if (facts.balance > 0)
    rows.push({
      id: 'holds',
      tone: 'warn',
      title: `Holds ${plural(facts.balance, 'membership', 'memberships')}`,
      detail: heldDetail
    });

  if (facts.kind === 'marketplace' && facts.openListings !== null && facts.openListings > 0)
    rows.push({
      id: 'listings',
      tone: 'warn',
      title: `${plural(facts.openListings, 'resale listing is', 'resale listings are')} open`,
      detail:
        'The removal fails while the market holds a listed token. Ask the sellers to cancel first, or wait for the listings to end and clear them.'
    });

  if (facts.kind === 'auction' && facts.auctionRunning)
    rows.push({
      id: 'auction',
      tone: 'warn',
      title: 'An auction is running',
      detail:
        'The removal fails while the auction holds its token. Cancelling refunds the top bid and sends the token to the treasury.',
      cleanup: 'auction'
    });

  if (facts.kind === 'claims' && facts.openLists !== null && facts.openLists > 0)
    rows.push({
      id: 'lists',
      tone: 'warn',
      title: `${plural(facts.openLists, 'claim list is', 'claim lists are')} open`,
      detail: 'Unclaimed allocations stop being claimable.'
    });

  if (facts.votes > 0n && facts.balance === 0)
    rows.push({
      id: 'votes',
      tone: 'warn',
      title: `Holds ${facts.votes.toString()} ${facts.votes === 1n ? 'vote' : 'votes'}`,
      detail: 'Votes delegated to this contract stay with it.'
    });

  rows.push({
    id: 'agent',
    tone: 'ok',
    title: facts.transferAgent ? 'Can move memberships' : 'Not a transfer agent',
    detail: facts.transferAgent ? 'Removing it turns this off for you.' : 'Nothing else to turn off.'
  });
  return rows;
}
