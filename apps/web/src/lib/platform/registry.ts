'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import { instanceKey, instanceValue, rpcLedgerRead } from '@/lib/chain-reads/renewal';
import {
  CURRENT_SLOTS,
  type CurrentSlot,
  getPlatformConfig,
  IMPLEMENTATION_NAMES,
  type ImplementationName,
  type PlatformConfig
} from '@/lib/platform/config';
import type { IndexedImplementation } from '@/lib/platform/indexed';

export type RegistryImplementation = {
  name: string;
  version: string;
  hash: string;
  publishedLedger: number | null;
  /** Live, from `get_implementation(hash)`; the indexed value when the chain could not be read. */
  revoked: boolean;
  usedBy: number;
  /** The registry's announced latest for its name (`latest_pointer`). */
  latest: boolean;
  /** The `CurrentImplementations` slot new tribes and modules are deployed from, if any. */
  current: CurrentSlot | null;
  /** The Manager runs this hash itself. */
  running: boolean;
};

/** Everything the platform page shows, read live from chain except the list of registered hashes. */
export type PlatformState = {
  latestLedger: number;
  managerAddress: string;
  admin: string | null;
  pendingAdmin: string | null;
  managerHash: string | null;
  managerVersion: string | null;
  /** From the Manager's instance storage (the contract has no getter); null when unreadable. */
  factoryPaused: boolean | null;
  /** The notice in force (`upgrade_delay()`), in ledgers. */
  upgradeDelay: number | null;
  /** A shorter notice waiting for the one in force to pass. */
  pendingDelay: { ledgers: number; effectiveLedger: number } | null;
  current: Partial<Record<CurrentSlot, string>> | null;
  latest: Partial<Record<ImplementationName, string>>;
  implementations: RegistryImplementation[];
  /** Every code hash a tribe module runs (indexed), for the shared-code renewal. */
  runningHashes: string[];
  /** Reads that failed; the rest of the page still shows. */
  errors: string[];
};

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

/** Group implementations by registry name in page order, newest registration first. */
export function groupImplementations(rows: RegistryImplementation[]) {
  const known = new Set<string>(IMPLEMENTATION_NAMES);
  const names = [...IMPLEMENTATION_NAMES, ...new Set(rows.map((r) => r.name).filter((n) => !known.has(n)))];
  return names
    .map((name) => ({
      name,
      rows: rows.filter((r) => r.name === name).sort((a, b) => (b.publishedLedger ?? 0) - (a.publishedLedger ?? 0))
    }))
    .filter((group) => group.rows.length > 0);
}

/**
 * Join the indexed list with the live chain state. A hash the chain points at (latest, current,
 * running) but the index has not seen yet still appears, from its on-chain record.
 */
export function assembleImplementations(input: {
  indexed: IndexedImplementation[];
  records: Map<string, { name: string; version: string; revoked: boolean; publishedLedger: number } | null>;
  latest: Partial<Record<string, string>>;
  current: Partial<Record<CurrentSlot, string>> | null;
  managerHash: string | null;
}): RegistryImplementation[] {
  const byHash = new Map<string, RegistryImplementation>();
  const currentSlotOf = (hash: string) =>
    (Object.entries(input.current ?? {}).find(([, h]) => h === hash)?.[0] as CurrentSlot | undefined) ?? null;
  const latestHashes = new Set(Object.values(input.latest).filter(Boolean));
  const add = (row: Omit<RegistryImplementation, 'latest' | 'current' | 'running'>) => {
    const record = input.records.get(row.hash);
    byHash.set(row.hash, {
      ...row,
      // A missing record means the chain could not be read for it: keep the indexed value.
      revoked: record ? record.revoked : row.revoked,
      latest: latestHashes.has(row.hash),
      current: currentSlotOf(row.hash),
      running: row.hash === input.managerHash
    });
  };
  for (const row of input.indexed) add(row);
  for (const [hash, record] of input.records) {
    if (byHash.has(hash) || !record) continue;
    add({
      name: record.name,
      version: record.version,
      hash,
      publishedLedger: record.publishedLedger,
      revoked: record.revoked,
      usedBy: 0
    });
  }
  return [...byHash.values()];
}

/** Read-only for everyone; actions only for the live Manager admin with a signed-in session. */
export function isPlatformAdmin(
  session: { authStatus: string; address?: string | null },
  admin: string | null | undefined
): boolean {
  return Boolean(admin && session.authStatus === 'authenticated' && session.address && session.address === admin);
}

async function fetchIndexed(): Promise<{ implementations: IndexedImplementation[]; runningHashes: string[] }> {
  const response = await fetch('/api/platform/registry', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function loadPlatformState(config: PlatformConfig): Promise<PlatformState> {
  const manager = new ManagerClient(adminReadOptions(config, config.managerAddress));
  const rpc = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const errors: string[] = [];
  const attempt = async <T>(label: string, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await work();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  const view = <T>(label: string, call: () => Promise<{ result: T }>) =>
    attempt(label, async () => (await call()).result);

  const [indexed, admin, pendingAdmin, upgradeDelay, managerHash, managerVersion, current, instance, ...pointers] =
    await Promise.all([
      attempt('registry index', fetchIndexed),
      view('get_admin', () => manager.get_admin()),
      view('get_pending_admin', () => manager.get_pending_admin()),
      view('upgrade_delay', () => manager.upgrade_delay()),
      view('wasm_hash', () => manager.wasm_hash()),
      view('version', () => manager.version()),
      view('current_implementations', () => manager.current_implementations()),
      attempt('Manager instance', () => rpcLedgerRead(rpc)([instanceKey(config.managerAddress)])),
      ...IMPLEMENTATION_NAMES.map((name) => view(`latest_pointer(${name})`, () => manager.latest_pointer({ name })))
    ]);

  const latest: Partial<Record<ImplementationName, string>> = {};
  IMPLEMENTATION_NAMES.forEach((name, i) => {
    const pointer = pointers[i];
    if (pointer) latest[name] = hex(pointer.wasm_hash);
  });
  const currentHashes: Partial<Record<CurrentSlot, string>> | null = current
    ? Object.fromEntries((Object.keys(CURRENT_SLOTS) as CurrentSlot[]).map((slot) => [slot, hex(current[slot])]))
    : null;
  const managerHashHex = managerHash ? hex(managerHash) : null;

  // Live revoked state for every hash the page shows.
  const hashes = new Set<string>([
    ...(indexed?.implementations.map((row) => row.hash) ?? []),
    ...Object.values(latest),
    ...Object.values(currentHashes ?? {}),
    ...(managerHashHex ? [managerHashHex] : [])
  ]);
  const records = new Map<
    string,
    { name: string; version: string; revoked: boolean; publishedLedger: number } | null
  >();
  await Promise.all(
    [...hashes].map(async (hash) => {
      const record = await view(`get_implementation(${hash.slice(0, 8)})`, () =>
        manager.get_implementation({ wasm_hash: Buffer.from(hash, 'hex') })
      );
      records.set(
        hash,
        record
          ? {
              name: record.name,
              version: record.version,
              revoked: record.revoked,
              publishedLedger: Number(record.published_ledger)
            }
          : null
      );
    })
  );

  const entry = instance?.entries.get(instanceKey(config.managerAddress).toXDR('base64'));
  const pending = instanceValue<{ ledgers: number; effective_ledger: number }>(entry, 'PendingUpgradeDelay');
  const latestLedger = instance?.latestLedger ?? 0;
  return {
    latestLedger,
    managerAddress: config.managerAddress,
    admin: admin ?? null,
    pendingAdmin: pendingAdmin ?? null,
    managerHash: managerHashHex,
    managerVersion: managerVersion ?? null,
    factoryPaused: entry ? Boolean(instanceValue<boolean>(entry, 'FactoryPaused')) : null,
    upgradeDelay: upgradeDelay === null ? null : Number(upgradeDelay),
    pendingDelay:
      pending && latestLedger < Number(pending.effective_ledger)
        ? { ledgers: Number(pending.ledgers), effectiveLedger: Number(pending.effective_ledger) }
        : null,
    current: currentHashes,
    latest,
    implementations: assembleImplementations({
      indexed: indexed?.implementations ?? [],
      records,
      latest,
      current: currentHashes,
      managerHash: managerHashHex
    }),
    runningHashes: indexed?.runningHashes ?? [],
    errors
  };
}

export function usePlatformState(config: PlatformConfig) {
  return useSWR(['platform-state', config.managerAddress, config.rpcUrl], () => loadPlatformState(config), {
    revalidateOnFocus: false
  });
}

/**
 * Whether `address` is the live Manager admin, for showing the Platform link. Reads only
 * `get_admin()`, and only for a signed-in wallet.
 */
export function useIsPlatformAdmin(address: string | null | undefined) {
  const { data } = useSWR(
    address ? ['platform-admin', address] : null,
    async () => {
      const config = getPlatformConfig();
      const manager = new ManagerClient(adminReadOptions(config, config.managerAddress));
      return (await manager.get_admin()).result ?? null;
    },
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
  );
  return Boolean(address && data && data === address);
}
