'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';
import useSWR from 'swr';

import { adminReadOptions } from '@/lib/admin-surfaces';
import { effectiveUpgradeDelay, instanceKey, instanceWasmHash, rpcLedgerRead } from '@/lib/chain-reads/renewal';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

/**
 * Upgrades of the platform contracts every DAO depends on (docs/STORAGE_DIET.md
 * D39, D42): the Manager (registry and factory) and the shared Minter (a mint
 * authority on every Token). Both upgrade only to the hash the registry
 * announces as latest, and only `upgrade_delay()` ledgers after the later of
 * the approval and the announcement, so "running → latest" is every upgrade
 * that can happen and this display sees each for the full notice. A DAO that
 * distrusts a pending Minter upgrade revokes the Minter's mint authority by
 * proposal within that notice.
 */
export type PlatformContract = 'manager' | 'minter';

export type PendingUpgrade = {
  toHash: string;
  version: string | null;
  approvedLedger: number;
  /** Ledger the hash was announced as latest. */
  announcedLedger: number;
  /** First ledger at which the upgrade may apply: the later of the two, plus the notice. */
  earliestLedger: number;
};

export type PlatformContractState = {
  contract: PlatformContract;
  address: string;
  /** Hex of the running wasm hash; null when the instance could not be read. */
  running: string | null;
  /** Ledgers of notice between approval and the earliest upgrade. */
  notice: number;
  pending: PendingUpgrade | null;
};

export type PlatformUpgrades = {
  latestLedger: number;
  manager: PlatformContractState | null;
  minter: PlatformContractState | null;
  /** Whether the shared Minter currently holds mint authority on this DAO's token. */
  minterAuthority: boolean | null;
  /** Reads that failed, so the display can say it is incomplete rather than quiet. */
  errors: string[];
};

/** The pending upgrade of a contract, given what the registry and the chain say. */
export function describePending(
  running: string | null,
  latest: { hash: string; version: string | null; announcedLedger: number } | null,
  approvedLedger: number | null,
  notice: number
): PendingUpgrade | null {
  if (!running || !latest || latest.hash === running || approvedLedger === null) return null;
  return {
    toHash: latest.hash,
    version: latest.version,
    approvedLedger,
    announcedLedger: latest.announcedLedger,
    earliestLedger: Math.max(approvedLedger, latest.announcedLedger) + notice
  };
}

const hex = (bytes: Uint8Array | undefined | null) => (bytes ? Buffer.from(bytes).toString('hex') : null);

export async function loadPlatformUpgrades(
  config: DaoNetworkConfig,
  address?: string | null
): Promise<PlatformUpgrades> {
  const managerAddress = getDeploymentConfig().managerAddress;
  const manager = new ManagerClient(adminReadOptions(config, managerAddress, address));
  const token = new TokenClient(adminReadOptions(config, config.tokenContractId, address));
  const server = new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const read = rpcLedgerRead(server);
  const errors: string[] = [];
  const attempt = async <T>(label: string, work: () => Promise<T>): Promise<T | null> => {
    try {
      return await work();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const minterAddress =
    config.minterContractId || (await attempt('token.minter', async () => (await token.minter()).result)) || null;
  const keys = [instanceKey(managerAddress), ...(minterAddress ? [instanceKey(minterAddress)] : [])];
  // Every read settles on its own: one missing registration must not blank the display.
  const [entries, managerNotice, managerLatest, minterLatest, authority] = await Promise.all([
    attempt('ledger entries', () => read(keys)),
    attempt('manager.upgrade_delay', async () => Number((await manager.upgrade_delay()).result)),
    attempt('latest Manager', () => latestOf(manager, 'Manager')),
    attempt('latest Minter', () => latestOf(manager, 'Minter')),
    minterAddress
      ? attempt('token.mint_authority', async () => (await token.mint_authority({ authority: minterAddress })).result)
      : Promise.resolve(null)
  ]);
  const latestLedger = entries?.latestLedger ?? 0;
  const running = (contract: string) => {
    const entry = entries?.entries.get(instanceKey(contract).toXDR('base64'));
    if (!entry || entry.val.type !== 'contractData') return null;
    return instanceWasmHash(entry.val.contractData.val);
  };
  const approved = async (from: string | null, to: string | null) => {
    if (!from || !to || from === to) return null;
    const ledger = await attempt(
      'manager.upgrade_approved_ledger',
      async () =>
        (
          await manager.upgrade_approved_ledger({
            from_hash: Buffer.from(from, 'hex'),
            to_hash: Buffer.from(to, 'hex')
          })
        ).result
    );
    return ledger === null || ledger === undefined ? null : Number(ledger);
  };

  let managerState: PlatformContractState | null = null;
  if (managerNotice !== null) {
    const managerRunning = running(managerAddress);
    managerState = {
      contract: 'manager',
      address: managerAddress,
      running: managerRunning,
      notice: managerNotice,
      pending: describePending(
        managerRunning,
        managerLatest,
        await approved(managerRunning, managerLatest?.hash ?? null),
        managerNotice
      )
    };
  }
  let minterState: PlatformContractState | null = null;
  if (minterAddress && entries) {
    const minterRunning = running(minterAddress);
    const minterNotice = effectiveUpgradeDelay(
      entries.entries.get(instanceKey(minterAddress).toXDR('base64')),
      latestLedger
    );
    minterState = {
      contract: 'minter',
      address: minterAddress,
      running: minterRunning,
      notice: minterNotice,
      pending: describePending(
        minterRunning,
        minterLatest,
        await approved(minterRunning, minterLatest?.hash ?? null),
        minterNotice
      )
    };
  }
  return { latestLedger, manager: managerState, minter: minterState, minterAuthority: authority, errors };
}

/** The registry's announced latest for a name: hash, version and the ledger it was announced at (D42). */
async function latestOf(manager: ManagerClient, name: string) {
  const pointer = (await manager.latest_pointer({ name })).result;
  if (!pointer) return null;
  const record = (await manager.get_latest_implementation({ name })).result as { version?: string } | null;
  return {
    hash: Buffer.from(pointer.wasm_hash).toString('hex'),
    version: record?.version ?? null,
    announcedLedger: Number(pointer.set_ledger)
  };
}

export function usePlatformUpgrades(config: DaoNetworkConfig, address?: string | null, enabled = true) {
  return useSWR(
    enabled && config.tokenContractId
      ? ['platform-upgrades', config.tokenContractId, config.rpcUrl, address || '']
      : null,
    () => loadPlatformUpgrades(config, address),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
}
