/**
 * TTL expiry math for DAO state (shared module code and artwork entries).
 *
 * Pure logic only: no network access. The RPC reads live in `ttl-expiry-rpc.ts`.
 * Economics and the operator runbook are in docs/TTL_ECONOMICS.md.
 */

/** Soroban ledger cadence used throughout docs/TTL_ECONOMICS.md (5 s per ledger). */
export const LEDGERS_PER_DAY = 17_280;
export const SECONDS_PER_LEDGER = 5;

/** Warn when an entry has fewer days than this left. */
export const TTL_SOON_DAYS = 45;
/** Escalate to critical when an entry has fewer days than this left. */
export const TTL_CRITICAL_DAYS = 14;

/** Largest window accepted by `metadata.bump_artwork_ttl` (MAX_PAGE in the contract). */
export const ARTWORK_BUMP_MAX_WINDOW = 50;

export type TtlStatus = 'healthy' | 'soon' | 'critical' | 'expired';

export type TtlEntry = {
  /** Human label for messages, e.g. `Property(2)` or `code:token`. */
  label: string;
  /**
   * Last ledger the entry is live through (RPC `liveUntilLedgerSeq`).
   * `null` when the RPC returned no entry: absent or archived.
   */
  liveUntilLedgerSeq: number | null;
};

export type TtlAssessment = {
  status: TtlStatus;
  /** Ledgers until the limiting entry's live-until; `null` when an entry is missing. */
  remainingLedgers: number | null;
  /** Whole days until the limiting entry expires (floored, never negative); `null` when missing. */
  remainingDays: number | null;
  /** The minimum live-until across the entries; `null` when an entry is missing. */
  liveUntilLedgerSeq: number | null;
  /** Label of the entry that limits the assessment. */
  limitingLabel: string | null;
  /** Labels of entries the RPC did not return (archived or absent). */
  missingLabels: string[];
};

/**
 * Classify remaining ledgers.
 *
 * `expired` at or after the live-until ledger (`remaining <= 0`). This is one ledger more
 * conservative than the protocol, which keeps an entry readable through its live-until ledger.
 */
export function classifyRemainingLedgers(remainingLedgers: number): TtlStatus {
  if (!Number.isFinite(remainingLedgers)) {
    throw new Error(`remainingLedgers must be finite, got ${remainingLedgers}`);
  }
  if (remainingLedgers <= 0) return 'expired';
  if (remainingLedgers < TTL_CRITICAL_DAYS * LEDGERS_PER_DAY) return 'critical';
  if (remainingLedgers < TTL_SOON_DAYS * LEDGERS_PER_DAY) return 'soon';
  return 'healthy';
}

/** Severity order used to combine statuses: the worst status wins. */
const STATUS_RANK: Record<TtlStatus, number> = { healthy: 0, soon: 1, critical: 2, expired: 3 };

export function worstTtlStatus(statuses: TtlStatus[]): TtlStatus {
  return statuses.reduce<TtlStatus>(
    (worst, next) => (STATUS_RANK[next] > STATUS_RANK[worst] ? next : worst),
    'healthy'
  );
}

/**
 * Assess a group of entries that must all stay live. The group expires when its
 * earliest live-until is reached, and any missing entry makes the group expired.
 */
export function assessEntries(entries: TtlEntry[], latestLedger: number): TtlAssessment {
  if (entries.length === 0) {
    throw new Error('assessEntries needs at least one entry');
  }
  if (!Number.isInteger(latestLedger) || latestLedger < 0) {
    throw new Error(`latestLedger must be a non-negative integer, got ${latestLedger}`);
  }

  const missingLabels = entries
    .filter((entry) => entry.liveUntilLedgerSeq === null || !Number.isFinite(entry.liveUntilLedgerSeq))
    .map((entry) => entry.label);

  if (missingLabels.length > 0) {
    return {
      status: 'expired',
      remainingLedgers: null,
      remainingDays: null,
      liveUntilLedgerSeq: null,
      limitingLabel: missingLabels[0] ?? null,
      missingLabels
    };
  }

  const live = entries.map((entry) => ({ label: entry.label, liveUntil: entry.liveUntilLedgerSeq as number }));
  const limiting = live.reduce((min, next) => (next.liveUntil < min.liveUntil ? next : min));

  const remainingLedgers = limiting.liveUntil - latestLedger;
  const status = classifyRemainingLedgers(remainingLedgers);

  return {
    status,
    remainingLedgers,
    remainingDays: Math.max(0, Math.floor(remainingLedgers / LEDGERS_PER_DAY)),
    liveUntilLedgerSeq: limiting.liveUntil,
    limitingLabel: limiting.label,
    missingLabels: []
  };
}

/** Human summary for missing entries: "Property(2), Item(2,0) and 3 more". */
export function describeMissing(labels: string[], maxShown = 3): string {
  if (labels.length === 0) return '';
  const shown = labels.slice(0, maxShown).join(', ');
  const extra = labels.length - maxShown;
  return extra > 0 ? `${shown} and ${extra} more` : shown;
}

/**
 * Estimated wall-clock expiry: now plus the remaining ledgers at 5 s each.
 * The ledger close time is not exact, so treat this as an estimate.
 */
export function estimateExpiryDate(remainingLedgers: number, nowMs: number): Date {
  return new Date(nowMs + remainingLedgers * SECONDS_PER_LEDGER * 1000);
}

export function pluralDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// ---------------------------------------------------------------------------
// Artwork bump windows
// ---------------------------------------------------------------------------

export type ArtworkBumpWindow = {
  /** Flat index of the first entry in the window (the contract's `start`). */
  start: number;
  /** Number of flat entries in the window (the contract's `limit`, <= 50). */
  limit: number;
};

/**
 * The flat artwork space that `bump_artwork_ttl` walks: every item in property order,
 * then every IPFS group. Must match the contract: an unreadable property header adds 0 items.
 */
export function artworkEntryTotal(itemCounts: number[], ipfsGroupCount: number): number {
  assertCount(ipfsGroupCount, 'ipfsGroupCount');
  let items = 0;
  for (const count of itemCounts) {
    assertCount(count, 'itemCount');
    items += count;
  }
  return items + ipfsGroupCount;
}

/**
 * Split `total` flat entries into consecutive windows of at most `maxWindow`.
 *
 * A total of 0 still yields one `{ start: 0, limit: 0 }` window: the contract bumps the
 * metadata instance on every call, so the instance is renewed even with no entries.
 */
export function planArtworkBumpWindows(total: number, maxWindow = ARTWORK_BUMP_MAX_WINDOW): ArtworkBumpWindow[] {
  assertCount(total, 'total');
  if (!Number.isInteger(maxWindow) || maxWindow < 1 || maxWindow > ARTWORK_BUMP_MAX_WINDOW) {
    throw new Error(`maxWindow must be an integer in 1..=${ARTWORK_BUMP_MAX_WINDOW}, got ${maxWindow}`);
  }
  if (total === 0) return [{ start: 0, limit: 0 }];

  const windows: ArtworkBumpWindow[] = [];
  for (let start = 0; start < total; start += maxWindow) {
    windows.push({ start, limit: Math.min(maxWindow, total - start) });
  }
  return windows;
}

/** The `next start` the contract must return for a window (`min(start + limit, total)`). */
export function expectedNextStart(window: ArtworkBumpWindow, total: number): number {
  return Math.min(window.start + window.limit, total);
}

function assertCount(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${value}`);
  }
}
