'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import { Client as MetadataClient } from '@builder-stellar/metadata-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import useSWR from 'swr';

import {
  hashFromHex,
  moduleAddressKeys,
  readAdminModuleVersion,
  type UpgradeModule
} from '@/lib/admin-module-versions';
import { adminReadOptions } from '@/lib/admin-surfaces';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { classifyModule, MODULE_ORDER, type ModuleUpdate, planModuleUpdates } from '@/lib/module-updates';
import { signWithWallet } from '@/lib/wallet-sign';

export type ModuleRow =
  | { module: UpgradeModule; ok: true; state: Awaited<ReturnType<typeof readAdminModuleVersion>>; update: ModuleUpdate }
  | { module: UpgradeModule; ok: false; error: string };

/**
 * Every module's version and update status for one community, read live (one request per module,
 * shared across the pages that show it).
 */
export function useModuleUpdates(config: DaoNetworkConfig, address?: string | null, enabled = true) {
  const modules = MODULE_ORDER.filter((module) => config[moduleAddressKeys[module]]);
  const swr = useSWR(
    enabled && config.tokenContractId ? ['module-updates', config.tokenContractId, config.rpcUrl, address || ''] : null,
    async (): Promise<ModuleRow[]> =>
      Promise.all(
        modules.map(async (module): Promise<ModuleRow> => {
          try {
            const state = await readAdminModuleVersion(config, module, address);
            return { module, ok: true, state, update: classifyModule(state) };
          } catch (error) {
            return { module, ok: false, error: (error as Error).message };
          }
        })
      ),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const rows = swr.data ?? [];
  const updates = rows.flatMap((row) => (row.ok ? [row.update] : []));
  return { ...swr, rows, plan: planModuleUpdates(updates) };
}

const CLIENTS = {
  token: TokenClient,
  governor: GovernorClient,
  auction: AuctionClient,
  treasury: TreasuryClient,
  marketplace: MarketplaceClient,
  metadata: MetadataClient
};

/** During setup the launch admin owns every module and upgrades it directly (one signature). */
export async function upgradeModuleDirectly(
  config: DaoNetworkConfig,
  module: UpgradeModule,
  fromHash: string,
  toHash: string,
  address: string
) {
  const contractId = config[moduleAddressKeys[module]];
  if (!contractId) throw new Error('No module address configured.');
  const client = new CLIENTS[module]({
    ...adminReadOptions(config, contractId, address),
    signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
      signWithWallet(xdr, { ...opts, address, networkPassphrase: config.passphrase })
  });
  const assembled = await client.upgrade({ from_hash: hashFromHex(fromHash), to_hash: hashFromHex(toHash) });
  const sent = await assembled.signAndSend();
  return sent.sendTransactionResponse?.hash ?? '';
}
