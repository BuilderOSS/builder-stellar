import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as ManagerClient, type PendingDao } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

export type LaunchReadiness = {
  pending: PendingDao | null;
  supply: bigint;
  owner: string;
  live: boolean;
  paymentAssetsMatch: boolean;
  platformMinter: string | null;
};
export async function readLaunchReadiness(daoId: string, config: DaoNetworkConfig): Promise<LaunchReadiness> {
  const deployment = getDeploymentConfig();
  if (deployment.name !== config.name) throw new Error('DAO network does not match the configured Manager');
  const options = {
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    allowHttp: config.rpcUrl.startsWith('http://')
  };
  const manager = new ManagerClient({ ...options, contractId: deployment.managerAddress });
  const token = new TokenClient({ ...options, contractId: daoId });
  const [pendingTx, supplyTx, ownerTx, liveTx, minterTx] = await Promise.all([
    manager.get_pending_dao({ token_address: daoId }),
    token.total_supply(),
    token.owner(),
    token.is_live(),
    manager.get_platform_minter()
  ]);
  const pending = pendingTx.result;
  let paymentAssetsMatch = false;
  if (pending) {
    if (pending.addresses.token !== daoId) throw new Error('Manager returned a different DAO identity');
    const auction = new AuctionClient({ ...options, contractId: pending.addresses.auction });
    const marketplace = new MarketplaceClient({ ...options, contractId: pending.addresses.marketplace });
    const [auctionTx, marketplaceTx] = await Promise.all([auction.get_config(), marketplace.get_config()]);
    paymentAssetsMatch =
      auctionTx.result.payment_token === pending.auction_payment_asset &&
      marketplaceTx.result.payment_asset === pending.marketplace_payment_asset;
  }
  return {
    pending,
    supply: supplyTx.result,
    owner: ownerTx.result,
    live: liveTx.result,
    paymentAssetsMatch,
    platformMinter: minterTx.result
  };
}
export function launchReadinessIssues(readiness: LaunchReadiness, launchAdmin: string): string[] {
  if (readiness.live) return ['This DAO is already live. Refresh the overview.'];
  const issues: string[] = [];
  if (!readiness.pending || readiness.pending.launch_admin !== launchAdmin)
    issues.push('Pending DAO ownership could not be verified on this Manager.');
  if (readiness.owner !== launchAdmin) issues.push('Token ownership no longer belongs to the launch administrator.');
  if (readiness.supply <= 0n) issues.push('Mint at least one founder token before launch.');
  if (!readiness.paymentAssetsMatch)
    issues.push('Restore the payment assets pinned at creation in both modules before launch.');
  return issues;
}
