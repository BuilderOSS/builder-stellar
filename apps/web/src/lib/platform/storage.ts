'use client';

import { xdr } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';
import useSWR from 'swr';

import {
  codeHealthStatus,
  type CodeStatus,
  instanceKey,
  type LedgerEntryInfo,
  type LedgerRead,
  persistentDataKey,
  rpcLedgerRead
} from '@/lib/chain-reads/renewal';
import type { PlatformConfig } from '@/lib/platform/config';
import { IMPLEMENTATION_NAMES } from '@/lib/platform/config';
import type { PlatformState } from '@/lib/platform/registry';
import { quoteSweep, readMaxEntryTtl, type SweepTransaction } from '@/lib/renewal-queries';
import { namespacedKey } from '@/lib/storage-key';

/**
 * The platform's renewal duty (docs/STORAGE_DIET.md § 7, D28), as `scripts/renew-code-ttl.mjs` does it:
 * shared code for every hash in use or about to be, the Manager instance, each of those hashes'
 * `Implementation(hash)` record (every `version()` reads it) and each `LatestImplementation(name)`.
 */
export const PLATFORM_CLASSES = ['code', 'records', 'pointers', 'manager'] as const;
export type PlatformClass = (typeof PLATFORM_CLASSES)[number];

export const PLATFORM_CLASS_LABELS: Record<PlatformClass, string> = {
  code: 'Shared contract code',
  records: 'Implementation records',
  pointers: 'Latest pointers',
  manager: 'Tribe Builder registry'
};

export const PLATFORM_CLASS_HINTS: Record<PlatformClass, string> = {
  code: 'The code every tribe runs, shared by all of them',
  records: 'What each version() call reads',
  pointers: 'What the registry announces as latest',
  manager: 'The registry and factory itself'
};

/**
 * Contracts bump their own code only to 4 days, so a renewal at or under that is paid again by the
 * next caller. The script refuses it too (`parseCodeTtlDays`).
 */
export const MIN_PLATFORM_RENEWAL_DAYS = 5;
export const DEFAULT_PLATFORM_RENEWAL_DAYS = 170;

export type PlatformKey = { cls: PlatformClass; label: string; key: xdr.LedgerKey };
export type PlatformInventory = {
  latestLedger: number;
  present: Array<PlatformKey & LedgerEntryInfo>;
  /** Keys that must exist but are archived or gone: restored first. */
  missing: PlatformKey[];
};

const codeKey = (hash: string) =>
  xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') }));

/** Every code hash the platform keeps alive, labelled by why (the script's collection rules). */
export function platformHashes(state: Pick<PlatformState, 'managerHash' | 'current' | 'latest' | 'runningHashes'>) {
  const hashes = new Map<string, string>();
  const add = (hash: string | null | undefined, label: string) => {
    if (hash && /^[0-9a-f]{64}$/i.test(hash) && !hashes.has(hash)) hashes.set(hash, label);
  };
  add(state.managerHash, 'Manager (running)');
  for (const [slot, hash] of Object.entries(state.current ?? {})) add(hash, `${slot} (new tribes)`);
  for (const [name, hash] of Object.entries(state.latest)) add(hash, `${name} (latest)`);
  for (const hash of state.runningHashes) add(hash, 'run by a tribe');
  return hashes;
}

/** The keys to keep alive, all required: a missing one is restored. */
export function platformKeys(
  manager: string,
  state: Pick<PlatformState, 'managerHash' | 'current' | 'latest' | 'runningHashes'>
): PlatformKey[] {
  const keys: PlatformKey[] = [{ cls: 'manager', label: 'Manager instance', key: instanceKey(manager) }];
  for (const [hash, label] of platformHashes(state)) {
    keys.push({ cls: 'code', label: `${label} code ${hash.slice(0, 8)}`, key: codeKey(hash) });
    keys.push({
      cls: 'records',
      label: `Implementation ${hash.slice(0, 8)}`,
      key: persistentDataKey(manager, namespacedKey('Implementation', xdr.ScVal.scvBytes(Buffer.from(hash, 'hex'))))
    });
  }
  for (const name of IMPLEMENTATION_NAMES) {
    if (!state.latest[name as keyof typeof state.latest]) continue;
    keys.push({
      cls: 'pointers',
      label: `Latest ${name}`,
      key: persistentDataKey(manager, namespacedKey('LatestImplementation', xdr.ScVal.scvString(name)))
    });
  }
  return keys;
}

export async function buildPlatformInventory(read: LedgerRead, keys: PlatformKey[]): Promise<PlatformInventory> {
  const { latestLedger, entries } = await read(keys.map((k) => k.key));
  const present: PlatformInventory['present'] = [];
  const missing: PlatformKey[] = [];
  for (const key of keys) {
    const entry = entries.get(key.key.toXDR('base64'));
    if (!entry || entry.liveUntil < latestLedger) missing.push(key);
    else present.push({ ...key, ...entry });
  }
  return { latestLedger, present, missing };
}

export type PlatformClassSummary = {
  cls: PlatformClass;
  keys: number;
  missing: PlatformKey[];
  earliestLiveUntil: number | null;
  status: CodeStatus;
};

/** One row per class with the platform's thresholds (60 and 14 days, `codeHealthStatus`). */
export function summarizePlatform(inventory: PlatformInventory): PlatformClassSummary[] {
  return PLATFORM_CLASSES.map((cls) => {
    const present = inventory.present.filter((k) => k.cls === cls);
    const missing = inventory.missing.filter((k) => k.cls === cls);
    const earliestLiveUntil = present.length ? Math.min(...present.map((k) => k.liveUntil)) : null;
    const status: CodeStatus = missing.length ? 'expired' : codeHealthStatus(earliestLiveUntil, inventory.latestLedger);
    return { cls, keys: present.length + missing.length, missing, earliestLiveUntil, status };
  }).filter((summary) => summary.keys > 0);
}

export type PlatformStorage = { inventory: PlatformInventory; maxEntryTtl: number };

export async function loadPlatformStorage(config: PlatformConfig, state: PlatformState): Promise<PlatformStorage> {
  const rpc = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const [inventory, maxEntryTtl] = await Promise.all([
    buildPlatformInventory(rpcLedgerRead(rpc), platformKeys(config.managerAddress, state)),
    readMaxEntryTtl(rpc)
  ]);
  return { inventory, maxEntryTtl };
}

export function usePlatformStorage(config: PlatformConfig, state: PlatformState | undefined) {
  return useSWR(
    state ? ['platform-storage', config.managerAddress, config.rpcUrl, platformHashes(state).size] : null,
    () => loadPlatformStorage(config, state!),
    { revalidateOnFocus: false }
  );
}

export type PlatformQuote = {
  days: number;
  transactions: SweepTransaction[];
  totalFee: bigint;
  yearlyFee: bigint | null;
};

/** Simulate the platform sweep for `days`. Nothing is signed. */
export async function quotePlatformRenewal(
  config: PlatformConfig,
  storage: PlatformStorage,
  days: number,
  source: string
): Promise<PlatformQuote> {
  const sweep = await quoteSweep({
    rpcUrl: config.rpcUrl,
    passphrase: config.passphrase,
    source,
    days,
    maxEntryTtl: storage.maxEntryTtl,
    latestLedger: storage.inventory.latestLedger,
    present: storage.inventory.present,
    missing: storage.inventory.missing.map((k) => k.key)
  });
  return { days, transactions: sweep.transactions, totalFee: sweep.totalFee, yearlyFee: sweep.yearlyFee };
}
