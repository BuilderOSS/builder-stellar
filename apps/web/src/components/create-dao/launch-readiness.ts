import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as ClaimMinterClient } from '@builder-stellar/claim-minter-bindings';
import { type Assurance, Client as ManagerClient, type PendingDao } from '@builder-stellar/manager-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

export type LaunchReadiness = {
  pending: PendingDao | null;
  supply: bigint;
  admin: string;
  live: boolean;
  /** Every module the DAO has still uses the payment asset recorded at creation. */
  paymentAssetsMatch: boolean;
  /** An assurance drive is open: the DAO launches through it (launch_when_ready), not by launch_dao. */
  assurance: Assurance | null;
  /** The requested slug is already claimed by another launched DAO (launch would fail with SlugTaken). */
  slugTaken: boolean;
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
  const [pendingTx, supplyTx, adminTx, liveTx, assuranceTx] = await Promise.all([
    manager.get_pending_dao({ token_address: daoId }),
    token.total_supply(),
    token.admin(),
    token.is_live(),
    manager.get_assurance({ token_address: daoId })
  ]);
  const pending = pendingTx.result;
  let paymentAssetsMatch = false;
  let slugTaken = false;
  if (pending) {
    // get_dao_by_slug resolves launched DAOs only; a hit for another DAO means
    // this request lost the race and launch_dao would fail (SlugTaken, 7123).
    const claimed = (await manager.get_dao_by_slug({ slug: pending.slug })).result;
    slugTaken = claimed.isOk() && claimed.unwrap() !== daoId;
    if (pending.addresses.token !== daoId) throw new Error('Manager returned a different DAO identity');
    // Each module the DAO has must still use the asset recorded when it was created (launch
    // refuses otherwise, PaymentAssetMismatch); a module it does not have has nothing to check.
    const { auction, marketplace, claims } = pending.addresses;
    const checks = await Promise.all([
      auction
        ? new AuctionClient({ ...options, contractId: auction })
            .get_config()
            .then((tx) => tx.result.payment_token === pending.auction_payment_asset)
        : true,
      marketplace
        ? new MarketplaceClient({ ...options, contractId: marketplace })
            .get_config()
            .then((tx) => tx.result.payment_asset === pending.marketplace_payment_asset)
        : true,
      claims
        ? new ClaimMinterClient({ ...options, contractId: claims })
            .payment_asset()
            .then((tx) => tx.result === pending.claims_payment_asset)
        : true
    ]);
    paymentAssetsMatch = checks.every(Boolean);
  }
  return {
    pending,
    supply: supplyTx.result,
    admin: adminTx.result,
    live: liveTx.result,
    paymentAssetsMatch,
    assurance: assuranceTx.result ?? null,
    slugTaken
  };
}
export function launchReadinessIssues(readiness: LaunchReadiness, launchAdmin: string): string[] {
  if (readiness.live) return ['This DAO is already live. Refresh the overview.'];
  if (readiness.assurance)
    return [
      'This community is in a launch drive. Once enough people have claimed, anyone can launch it from the claims page.'
    ];
  const issues: string[] = [];
  if (!readiness.pending || readiness.pending.launch_admin !== launchAdmin)
    issues.push('Pending DAO admin rights could not be verified on this Manager.');
  if (readiness.admin !== launchAdmin) issues.push('Token admin no longer belongs to the launch administrator.');
  if (readiness.supply <= 0n) issues.push('Mint at least one founder token before launch.');
  if (readiness.slugTaken && readiness.pending)
    issues.push(`Another community launched first with /dao/${readiness.pending.slug}. Pick another link below.`);
  if (!readiness.paymentAssetsMatch)
    issues.push('Restore the payment assets set at creation in every module before launch.');
  return issues;
}
