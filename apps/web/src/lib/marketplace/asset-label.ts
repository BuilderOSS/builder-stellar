import type { NetworkName } from '@/config/networks';
import { getTreasuryAssets } from '@/lib/assets-config';

import { formatMarketplaceAmount } from './amount';

// Asset.native().contractId("Standalone Network ; February 2017"). Verified against the SDK in tests.
// The shared local asset catalog uses a testnet placeholder and must not label it as local XLM.
export const MARKETPLACE_LOCAL_XLM_SAC = 'CDMLFMKMMD7MWZP3FKUBZPVHTUEDLSX4BYGYKH4GCESXYHS3IHQ4EIG4';

export function marketplaceAssetLabel(network: NetworkName, id: string) {
  // Never label an unknown or local testnet-placeholder SAC as USD.
  return network === 'local'
    ? id === MARKETPLACE_LOCAL_XLM_SAC
      ? 'XLM'
      : 'Unknown SAC'
    : (getTreasuryAssets(network).find((a) => a.contractId === id)?.code ?? 'Unknown SAC');
}

export function marketplaceDisplayAmount(network: NetworkName, assetId: string, amount: string | bigint) {
  const known =
    network === 'local'
      ? assetId === MARKETPLACE_LOCAL_XLM_SAC
      : getTreasuryAssets(network).some((asset) => asset.contractId === assetId);
  return known ? formatMarketplaceAmount(amount) : `${amount.toString()} base units`;
}
