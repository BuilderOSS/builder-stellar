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
 * D39): the Manager (registry and factory) and the shared Minter (a mint
 * authority on every Token). Both apply only `upgrade_delay()` ledgers after
 * the Manager's approval; a DAO that distrusts a pending Minter upgrade
 * revokes the Minter's mint authority by proposal within that notice.
 */
export type PlatformContract = 'manager' | 'minter';

export type PendingUpgrade = {
  toHash: string;
  version: string | null;
  approvedLedger: number;
  /** First ledger at which the upgrade may apply. */
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
  manager: PlatformContractState;
  minter: PlatformContractState | null;
  /** Whether the shared Minter currently holds mint authority on this DAO's token. */
  minterAuthority: boolean | null;
};

/** The pending upgrade of a contract, given what the registry and the chain say. */
export function describePending(
  running: string | null,
  latest: { hash: string; version: string | null } | null,
  approvedLedger: number | null,
  notice: number
): PendingUpgrade | null {
  if (!running || !latest || latest.hash === running || approvedLedger === null) return null;
  return { toHash: latest.hash, version: latest.version, approvedLedger, earliestLedger: approvedLedger + notice };
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

  const minterAddress = config.minterContractId || (await token.minter()).result || null;
  const keys = [instanceKey(managerAddress), ...(minterAddress ? [instanceKey(minterAddress)] : [])];
  const [entries, managerNotice, managerLatest, minterLatest, authority] = await Promise.all([
    read(keys),
    manager.upgrade_delay().then((r) => Number(r.result)),
    manager.get_latest_implementation({ name: 'Manager' }).then((r) => r.result),
    manager.get_latest_implementation({ name: 'Minter' }).then((r) => r.result),
    minterAddress ? token.mint_authority({ authority: minterAddress }).then((r) => r.result) : Promise.resolve(null)
  ]);
  const running = (contract: string) => {
    const entry = entries.entries.get(instanceKey(contract).toXDR('base64'));
    if (!entry || entry.val.type !== 'contractData') return null;
    return instanceWasmHash(entry.val.contractData.val);
  };
  const approved = async (from: string | null, to: string | null) => {
    if (!from || !to || from === to) return null;
    const ledger = (
      await manager.upgrade_approved_ledger({ from_hash: Buffer.from(from, 'hex'), to_hash: Buffer.from(to, 'hex') })
    ).result;
    return ledger === null || ledger === undefined ? null : Number(ledger);
  };
  const latestOf = (impl: { wasm_hash?: Uint8Array; version?: string } | null) =>
    impl?.wasm_hash ? { hash: hex(impl.wasm_hash)!, version: impl.version ?? null } : null;

  const managerRunning = running(managerAddress);
  const managerLatestHash = latestOf(managerLatest as { wasm_hash?: Uint8Array; version?: string } | null);
  const managerState: PlatformContractState = {
    contract: 'manager',
    address: managerAddress,
    running: managerRunning,
    notice: managerNotice,
    pending: describePending(
      managerRunning,
      managerLatestHash,
      await approved(managerRunning, managerLatestHash?.hash ?? null),
      managerNotice
    )
  };
  let minterState: PlatformContractState | null = null;
  if (minterAddress) {
    const minterRunning = running(minterAddress);
    const minterEntry = entries.entries.get(instanceKey(minterAddress).toXDR('base64'));
    const minterNotice = effectiveUpgradeDelay(minterEntry, entries.latestLedger);
    const minterLatestHash = latestOf(minterLatest as { wasm_hash?: Uint8Array; version?: string } | null);
    minterState = {
      contract: 'minter',
      address: minterAddress,
      running: minterRunning,
      notice: minterNotice,
      pending: describePending(
        minterRunning,
        minterLatestHash,
        await approved(minterRunning, minterLatestHash?.hash ?? null),
        minterNotice
      )
    };
  }
  return {
    latestLedger: entries.latestLedger,
    manager: managerState,
    minter: minterState,
    minterAuthority: authority
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
