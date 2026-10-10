import type { MarketplaceCommunity, MarketplaceListing } from './types';

export const MARKETPLACE_MAX_PAGE = 500;

export class MarketplaceError extends Error {
  constructor(
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}

export function marketplaceScope(deploymentId: string, daoId: string, contractId: string) {
  if (!deploymentId || !daoId || !contractId) throw new MarketplaceError('Marketplace identity is incomplete.', 404);
  return { deploymentId, daoId, contractId };
}

export function assertMarketplaceIdentity(
  row: { deploymentId: string; daoId: string; contractId: string },
  community: MarketplaceCommunity
) {
  if (
    !community.marketplaceContract ||
    row.deploymentId !== community.deploymentId ||
    row.daoId !== community.daoId ||
    row.contractId !== community.marketplaceContract
  ) {
    throw new MarketplaceError('Indexed marketplace identity does not match this community.', 503);
  }
}

export function listingStatus(
  status: string,
  expiresAt: string,
  now = Math.floor(Date.now() / 1000)
): MarketplaceListing['status'] {
  if (!['open', 'purchased', 'cancelled', 'expired'].includes(status))
    throw new MarketplaceError('Unknown indexed listing status.', 503);
  return status === 'open' && BigInt(expiresAt) <= BigInt(now)
    ? 'awaiting-expiry'
    : (status as MarketplaceListing['status']);
}

export function parseMarketplaceQuery(params: URLSearchParams) {
  const rawPage = params.get('page') ?? '0';
  if (!/^\d{1,3}$/.test(rawPage) || Number(rawPage) > MARKETPLACE_MAX_PAGE)
    throw new MarketplaceError('Invalid page.', 400);
  const kind = params.get('kind') ?? 'all';
  const status = params.get('status') ?? 'open';
  const capability = params.get('capability') ?? 'all';
  if (
    !['all', 'primary', 'secondary'].includes(kind) ||
    !['all', 'open', 'purchased', 'cancelled', 'expired'].includes(status) ||
    !['all', 'marketplace', 'auction', 'metadata'].includes(capability)
  )
    throw new MarketplaceError('Invalid marketplace filter.', 400);
  const search = (params.get('search') ?? '').trim();
  if (search.length > 120) throw new MarketplaceError('Search is too long.', 400);
  return { page: Number(rawPage), kind, status, capability, search, take: 24 };
}

export function matchesSnapshot(
  indexed: MarketplaceListing,
  live: {
    price: bigint;
    payment_asset: string;
    expires_at: bigint;
    seller?: string;
    fee_bps?: number;
  }
) {
  return (
    indexed.price === live.price.toString() &&
    indexed.paymentAsset === live.payment_asset &&
    indexed.expiresAt === live.expires_at.toString() &&
    (indexed.kind === 'primary' || (indexed.seller === live.seller && indexed.feeBps === live.fee_bps))
  );
}
