/** Claim lists from a spreadsheet: the shared wallet CSV reader, capped to what one list holds. */
import { type ParsedWalletList, parseWalletCsv } from '@/lib/wallet-csv';

import { type ClaimEntry, MAX_TREE_CLAIMS } from './tree';

/** One list holds at most this many tokens (its `total` is a u32). */
const MAX_LIST_TOKENS = 0xffffffffn;

export function parseClaimCsv(text: string): ParsedWalletList {
  return parseWalletCsv(text, { holder: 'one list', maxWallets: MAX_TREE_CLAIMS, maxTokens: MAX_LIST_TOKENS });
}

/** The rows as tree entries, once the list has nothing left to fix. */
export function claimEntries(parsed: ParsedWalletList): ClaimEntry[] | null {
  if (!parsed.rows.length || parsed.problems.length || parsed.duplicates.length) return null;
  return parsed.rows.map(({ address, amount }) => ({ address, amount }));
}
