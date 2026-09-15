import type { DaoNetworkConfig } from './dao-config';

export function getDaoAccountRole(config: DaoNetworkConfig, address: string) {
  if (address === config.auctionContractId) return 'Auction';
  if (address === config.treasuryContractId) return 'Treasury';
  return null;
}
