import type { NetworkName } from '@/config/networks';

export type ListingKind = 'primary' | 'secondary';
export type ListingStatus = 'open' | 'purchased' | 'cancelled' | 'expired' | 'awaiting-expiry';
export type Capability = 'marketplace' | 'auction' | 'metadata';
export interface MarketplaceCommunity {
  deploymentId: string;
  daoId: string;
  name: string;
  symbol: string;
  description: string;
  marketplaceContract: string | null;
  tokenContract: string;
  treasuryContract: string | null;
  status: string;
  capabilities: Capability[];
}
export interface MarketplaceListing {
  deploymentId: string;
  daoId: string;
  contractId: string;
  eventId: string;
  kind: ListingKind;
  /** Primary listing id OR secondary token id, always interpreted with kind. */
  id: string;
  tokenId: string | null;
  price: string;
  paymentAsset: string;
  feeBps: number;
  seller: string | null;
  buyer: string | null;
  expiresAt: string;
  status: ListingStatus;
  createdAt: string | null;
  closedAt: string | null;
  transactionHash: string;
}
export interface MarketplaceSale {
  eventId: string;
  kind: ListingKind;
  listingId: string | null;
  tokenId: string;
  price: string;
  fee: string | null;
  paymentAsset: string;
  buyer: string;
  seller: string | null;
  at: string | null;
  transactionHash: string;
}
export interface MarketplaceConfig {
  paymentAsset: string;
  feeBps: number;
  paused: boolean;
  treasury: string;
  token: string;
}
export interface MarketplaceDirectory {
  deploymentId: string;
  network: NetworkName;
  communities: MarketplaceCommunity[];
  hasMore: boolean;
}
export interface MarketplaceOffers {
  deploymentId: string;
  listings: MarketplaceListing[];
  communities: MarketplaceCommunity[];
  hasMore: boolean;
}
export interface DaoMarketplace extends MarketplaceOffers {
  network: NetworkName;
  community: MarketplaceCommunity;
  launched: boolean;
  openedAtLaunch: boolean | null;
  config: MarketplaceConfig | null;
  configError: string | null;
  sales: MarketplaceSale[];
  salesHasMore: boolean;
}
export type MarketplaceAction =
  | { action: 'buy' | 'cancel' | 'expire'; kind: ListingKind; id: string; eventId: string }
  | {
      action: 'approve' | 'list';
      tokenId: string;
      price: string;
      expiresAt: string;
      paymentAsset: string;
      feeBps: number;
    }
  | { action: 'revoke'; tokenId: string }
  | { action: 'trustline'; paymentAsset: string };
export interface MarketplacePrepared {
  deploymentId: string;
  daoId: string;
  address: string;
  network: NetworkName;
  networkPassphrase: string;
  rpcUrl: string;
  xdr: string;
  summary: string;
  fee: string;
}
export interface MarketplaceAccountReadiness {
  address: string;
  paymentAsset: string;
  assetCode: string;
  balance: string;
  available: string;
  nativeAvailable: string;
  /** Remaining authorized credit trustline capacity; native XLM has no trustline limit. */
  receivable: string | null;
  trustline: boolean;
  authorized: boolean;
  issues: string[];
  canAddTrustline: boolean;
}
export interface MarketplaceReadiness extends MarketplaceAccountReadiness {
  deploymentId: string;
  daoId: string;
}
export interface MarketplaceInventory {
  deploymentId: string;
  daoId: string;
  address: string;
  tokenIds: string[];
  hasMore: boolean;
}
