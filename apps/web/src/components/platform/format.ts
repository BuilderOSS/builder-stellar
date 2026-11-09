import { formatStroops } from '@/lib/auction-values';
import { estimateDate, SECONDS_PER_LEDGER } from '@/lib/chain-reads/renewal';
import { formatDuration } from '@/lib/duration';

/** "Mar 3, 2026, 2:14 PM" for a ledger, estimated at 5 seconds per ledger. */
export function whenLedger(ledger: number, latestLedger: number) {
  return estimateDate(ledger, latestLedger, Date.now()).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/** "7d", "2d 4h": a span of ledgers as time. */
export function ledgerSpan(ledgers: number) {
  return formatDuration(ledgers * SECONDS_PER_LEDGER);
}

export function xlm(stroops: bigint) {
  return `${formatStroops(stroops)} XLM`;
}

export const shortHash = (hash: string) => `${hash.slice(0, 8)}…`;
