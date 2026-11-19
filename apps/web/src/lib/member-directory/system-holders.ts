import type { DaoNetworkConfig } from '@/lib/dao-config';

type Contracts = Pick<DaoNetworkConfig, 'treasuryContractId' | 'auctionContractId' | 'marketplaceContractId'>;

/**
 * The tribe's own contracts that can hold a token ("Treasury", "Auction", "Marketplace"), or null for
 * anyone else. Tokens they hold carry no votes and never delegate, so pages name them instead of
 * showing a bare contract address.
 */
export function systemHolderName(config: Contracts, address: string | null | undefined): string | null {
  if (!address) return null;
  if (address === config.treasuryContractId) return 'Treasury';
  if (address === config.auctionContractId) return 'Auction';
  if (address === config.marketplaceContractId) return 'Marketplace';
  return null;
}
