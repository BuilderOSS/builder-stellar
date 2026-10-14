'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { sendAndConfirm, walletClientOptions } from '@/lib/minter/direct';

/**
 * Frees the link a failed launch drive reserved (`manager.release_slug`). Anyone may call it; it
 * moves no funds. The wallet signs the exact call, as for `launch_when_ready`. Returns the hash.
 */
export async function releaseDriveSlug(config: DaoNetworkConfig, address: string) {
  const manager = new ManagerClient(walletClientOptions(config, address, getDeploymentConfig().managerAddress));
  return sendAndConfirm(await manager.release_slug({ token_address: config.tokenContractId }), config.rpcUrl);
}
