/**
 * The "before you remove it" checklist (docs/designs/module-attach-ui.md § 4). Warnings never block:
 * the contract does not block a removal either, because anyone could stop one by sending the module
 * a token. Rows are plain data so the rules can be tested without the chain.
 */
import { type ModuleKind, UNLIMITED_ALLOWANCE } from './kinds';
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
  if (facts.kind === 'marketplace' && poolsToClean.length)
    rows.push({
      id: 'holds',
      tone: 'warn',
      title: `Holds ${plural(
        poolsToClean.reduce((sum, pool) => sum + pool.inStock, 0),
        'membership',
        'memberships'
      )} in ${plural(poolsToClean.length, 'pool', 'pools')}`,
      detail:
        'Left behind, they become the contract’s own votes, and nobody can cast them. They still count toward quorum.',
      cleanup: 'pools'
    });
  else if (facts.balance > 0)
    rows.push({
      id: 'holds',
      tone: 'warn',
      title: `Holds ${plural(facts.balance, 'membership', 'memberships')}`,
      detail:
        'Left behind, they become the contract’s own votes, and nobody can cast them. They still count toward quorum.'
    });

  if (facts.kind === 'marketplace' && facts.openListings !== null && facts.openListings > 0)
    rows.push({
      id: 'listings',
      tone: 'warn',
      title: `${plural(facts.openListings, 'resale listing is', 'resale listings are')} open`,
      detail:
        'Sellers keep their tokens, and each seller can still cancel. The listings disappear from the tribe’s market page. Wait for them to end, or ask the sellers to cancel first.'
    });

  if (facts.kind === 'auction' && facts.auctionRunning)
    rows.push({
      id: 'auction',
      tone: 'warn',
      title: 'An auction is running',
      detail: 'Its token stays with the auction unless you cancel it first. Cancelling refunds the top bid.',
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
    detail: facts.transferAgent ? 'Removing it switches that off for you.' : 'Nothing else to switch off.'
  });
  return rows;
}
