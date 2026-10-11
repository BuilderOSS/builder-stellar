import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import useSWR from 'swr';

import { hashFromHex } from '@/lib/admin-module-versions';
import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

export type UpgradeRelease = {
  /** Version the community runs now, if the Manager registered it. */
  fromVersion: string | null;
  /** Version the upgrade moves to, if the Manager registered it. */
  toVersion: string | null;
  /** The Manager approves moving from this release to that one. */
  approved: boolean;
  /** The target release was withdrawn. */
  revoked: boolean;
};

/** What the Manager's registry says about an upgrade path. Read-only; the contract checks it again when it runs. */
export async function readUpgradeRelease(config: DaoNetworkConfig, fromHash: string, toHash: string) {
  const deployment = getDeploymentConfig();
  if (deployment.networkPassphrase !== config.passphrase)
    throw new Error('DAO and Manager deployment networks do not match.');
  const manager = new ManagerClient(adminReadOptions(config, deployment.managerAddress));
  const [from, to, approved] = await Promise.all([
    manager.get_implementation({ wasm_hash: hashFromHex(fromHash) }),
    manager.get_implementation({ wasm_hash: hashFromHex(toHash) }),
    manager.is_upgrade_approved({ from_hash: hashFromHex(fromHash), to_hash: hashFromHex(toHash) })
  ]);
  return {
    fromVersion: from.result?.version ?? null,
    toVersion: to.result?.version ?? null,
    approved: approved.result,
    revoked: Boolean(to.result?.revoked)
  } satisfies UpgradeRelease;
}

export function useUpgradeRelease(config: DaoNetworkConfig, fromHash: string, toHash: string) {
  return useSWR(
    ['upgrade-release', config.rpcUrl, config.passphrase, fromHash, toHash] as const,
    () => readUpgradeRelease(config, fromHash, toHash),
    { revalidateOnFocus: false }
  );
}
