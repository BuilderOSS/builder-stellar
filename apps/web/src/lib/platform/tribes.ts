'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CLASS_LABELS, type RenewalClass, summarizeInventory } from '@/lib/chain-reads/renewal';
import type { PlatformConfig } from '@/lib/platform/config';
import type { PlatformTribe } from '@/lib/platform/indexed';
import { loadRenewalReport, type RenewalReport } from '@/lib/renewal-queries';
import { classifyRemainingLedgers, type TtlStatus } from '@/lib/ttl-expiry';

/** How many tribes are checked at once: each check is a handful of RPC reads. */
export const TRIBE_CHECK_CONCURRENCY = 3;

export type TribeHealth = {
  status: TtlStatus;
  /** The class that expires first, and when (ledger); null when nothing could be dated. */
  earliestClass: RenewalClass | null;
  earliestLiveUntil: number | null;
  latestLedger: number;
  /** Items that must exist but are archived or gone. */
  missing: number;
  /** The tribe's contracts themselves were archived. */
  bootstrap: boolean;
};

export type TribeRow =
  | { tribe: PlatformTribe; state: 'loading' }
  | { tribe: PlatformTribe; state: 'error'; error: string }
  | { tribe: PlatformTribe; state: 'ready'; health: TribeHealth };

/** The worst class of a tribe's storage, as the Renewal tab rates each one. */
export function summarizeTribe(report: Pick<RenewalReport, 'inventory'>): TribeHealth {
  const { inventory } = report;
  const latestLedger = inventory.latestLedger;
  if (inventory.bootstrap) {
    return {
      status: 'expired',
      earliestClass: 'contracts',
      earliestLiveUntil: null,
      latestLedger,
      missing: inventory.missing.length,
      bootstrap: true
    };
  }
  let status: TtlStatus = 'healthy';
  let earliestClass: RenewalClass | null = null;
  let earliestLiveUntil: number | null = null;
  const rank: Record<TtlStatus, number> = { healthy: 0, soon: 1, critical: 2, expired: 3 };
  for (const summary of summarizeInventory(inventory)) {
    const classStatus =
      summary.missing > 0 || summary.earliestLiveUntil === null
        ? 'expired'
        : classifyRemainingLedgers(summary.earliestLiveUntil - latestLedger);
    if (rank[classStatus] > rank[status]) status = classStatus;
    if (
      summary.earliestLiveUntil !== null &&
      (earliestLiveUntil === null || summary.earliestLiveUntil < earliestLiveUntil)
    ) {
      earliestLiveUntil = summary.earliestLiveUntil;
      earliestClass = summary.cls;
    }
  }
  return {
    status,
    earliestClass,
    earliestLiveUntil,
    latestLedger,
    missing: inventory.missing.length,
    bootstrap: false
  };
}

const ORDER: Record<string, number> = { expired: 0, critical: 1, error: 2, soon: 3, loading: 4, healthy: 5 };

/** Worst first; within a state, the one that expires soonest first. */
export function sortTribeRows(rows: TribeRow[]): TribeRow[] {
  const key = (row: TribeRow) => (row.state === 'ready' ? row.health.status : row.state);
  return [...rows].sort((a, b) => {
    const byState = ORDER[key(a)]! - ORDER[key(b)]!;
    if (byState) return byState;
    const left = a.state === 'ready' ? (a.health.earliestLiveUntil ?? -1) : Number.MAX_SAFE_INTEGER;
    const right = b.state === 'ready' ? (b.health.earliestLiveUntil ?? -1) : Number.MAX_SAFE_INTEGER;
    return left - right || a.tribe.name.localeCompare(b.tribe.name);
  });
}

/** Ready rows at "Renew soon" or worse, plus rows that could not be read. */
export function needsRenewal(row: TribeRow) {
  return row.state === 'error' || (row.state === 'ready' && row.health.status !== 'healthy');
}

export function earliestClassLabel(health: TribeHealth) {
  return health.earliestClass ? CLASS_LABELS[health.earliestClass] : null;
}

/** Run `work` over `items` with at most `limit` in flight. */
export async function eachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await work(item);
    }
  });
  await Promise.all(runners);
}

function tribeReportConfig(config: PlatformConfig, tribe: PlatformTribe) {
  return {
    rpcUrl: config.rpcUrl,
    passphrase: config.passphrase,
    tokenContractId: tribe.contracts.token,
    metadataContractId: tribe.contracts.metadata,
    treasuryContractId: tribe.contracts.treasury,
    governorContractId: tribe.contracts.governor,
    auctionContractId: tribe.contracts.auction,
    marketplaceContractId: tribe.contracts.marketplace,
    claimsContractId: tribe.contracts.claims
  };
}

async function fetchTribes(): Promise<PlatformTribe[]> {
  const response = await fetch('/api/platform/tribes', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return ((await response.json()) as { tribes: PlatformTribe[] }).tribes;
}

/**
 * Every tribe's storage health, checked a few at a time from chain. Rows fill in as they finish;
 * each one can fail and be retried on its own.
 */
export function usePlatformTribes(config: PlatformConfig) {
  const [rows, setRows] = useState<TribeRow[] | null>(null);
  const [listError, setListError] = useState('');
  const generation = useRef(0);

  const check = useCallback(
    async (tribe: PlatformTribe, run: number) => {
      const update = (row: TribeRow) => {
        if (run !== generation.current) return;
        setRows((current) => current?.map((r) => (r.tribe.daoId === tribe.daoId ? row : r)) ?? current);
      };
      update({ tribe, state: 'loading' });
      try {
        update({
          tribe,
          state: 'ready',
          health: summarizeTribe(await loadRenewalReport(tribeReportConfig(config, tribe)))
        });
      } catch (error) {
        update({ tribe, state: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    },
    [config]
  );

  // Results land in promise callbacks, never synchronously in the effect.
  const start = useCallback(
    (run: number) =>
      fetchTribes().then(
        async (tribes) => {
          if (run !== generation.current) return;
          setListError('');
          setRows(tribes.map((tribe) => ({ tribe, state: 'loading' })));
          await eachLimited(tribes, TRIBE_CHECK_CONCURRENCY, (tribe) => check(tribe, run));
        },
        (error: unknown) => {
          if (run !== generation.current) return;
          setListError(error instanceof Error ? error.message : String(error));
          setRows((current) => current ?? []);
        }
      ),
    [check]
  );

  useEffect(() => {
    void start(++generation.current);
  }, [start]);

  const refresh = useCallback(() => start(++generation.current), [start]);

  const retry = useCallback((tribe: PlatformTribe) => void check(tribe, generation.current), [check]);
  const checked = rows?.filter((row) => row.state !== 'loading').length ?? 0;
  return { rows, listError, refresh, retry, checked, total: rows?.length ?? 0 };
}
