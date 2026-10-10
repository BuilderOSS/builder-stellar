import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import type { ManagerDao, MarketplacePrimaryListing, MarketplaceSecondaryListing } from '@prisma/client';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { prisma } from '@/lib/prisma';

import { marketplaceId } from './amount';
import {
  assertMarketplaceIdentity,
  listingStatus,
  MARKETPLACE_MAX_PAGE,
  MarketplaceError,
  marketplaceScope,
  parseMarketplaceQuery
} from './query';
import type {
  DaoMarketplace,
  MarketplaceCommunity,
  MarketplaceDirectory,
  MarketplaceListing,
  MarketplaceOffers
} from './types';

export function marketplaceCommunity(row: ManagerDao): MarketplaceCommunity {
  if (row.deploymentId !== DEPLOYMENT_ID || row.daoId !== row.tokenContract || row.tokenAddress !== row.daoId) {
    throw new MarketplaceError('Indexed community identity is invalid.', 503);
  }
  return {
    deploymentId: row.deploymentId,
    daoId: row.daoId,
    name: row.tokenName || 'Unnamed community',
    symbol: row.tokenSymbol || '',
    description: row.tokenDescription || '',
    marketplaceContract: row.marketplaceContract,
    tokenContract: row.tokenContract,
    treasuryContract: row.treasuryContract,
    status: row.status,
    capabilities: [
      ...(row.marketplaceEnabled === true ? ['marketplace' as const] : []),
      ...(row.auctionEnabled === true ? ['auction' as const] : []),
      ...(row.metadataContract ? ['metadata' as const] : [])
    ]
  };
}

export async function marketplaceDao(daoId: string) {
  const row = await prisma.managerDao.findFirst({ where: { deploymentId: DEPLOYMENT_ID, daoId } });
  if (!row) throw new MarketplaceError('Community not found in this deployment.', 404);
  return marketplaceCommunity(row);
}

export function marketplaceClient(community: MarketplaceCommunity, publicKey?: string) {
  if (!community.marketplaceContract) throw new MarketplaceError('This community has no marketplace.', 404);
  const network = getDeploymentConfig();
  return new MarketplaceClient({
    contractId: community.marketplaceContract,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    publicKey,
    allowHttp: network.name === 'local'
  });
}

function mapListing(
  row: MarketplacePrimaryListing | MarketplaceSecondaryListing,
  kind: 'primary' | 'secondary'
): MarketplaceListing {
  const primary = 'listingId' in row;
  return {
    deploymentId: row.deploymentId,
    daoId: row.daoId,
    contractId: row.contractId,
    eventId: row.eventId,
    kind,
    id: (primary ? row.listingId : row.tokenId).toString(),
    tokenId: row.tokenId?.toString() ?? null,
    price: row.price.toFixed(0),
    paymentAsset: row.paymentAsset,
    feeBps: primary ? 0 : row.feeBps,
    seller: primary ? null : row.seller,
    buyer: row.buyer,
    expiresAt: row.expiresAt.toString(),
    status: listingStatus(row.status, row.expiresAt.toString()),
    createdAt: row.createdAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    transactionHash: row.createdTransactionHash
  };
}

function communityWhere(query: ReturnType<typeof parseMarketplaceQuery>) {
  return {
    deploymentId: DEPLOYMENT_ID,
    ...(query.search
      ? {
          OR: [
            { tokenName: { contains: query.search, mode: 'insensitive' as const } },
            { tokenSymbol: { contains: query.search, mode: 'insensitive' as const } },
            { tokenDescription: { contains: query.search, mode: 'insensitive' as const } }
          ]
        }
      : {}),
    ...(query.capability === 'marketplace' ? { marketplaceEnabled: true } : {}),
    ...(query.capability === 'auction' ? { auctionEnabled: true } : {}),
    ...(query.capability === 'metadata' ? { metadataContract: { not: null } } : {})
  };
}

export async function marketplaceDirectory(params: URLSearchParams): Promise<MarketplaceDirectory> {
  const query = parseMarketplaceQuery(params);
  const rows = await prisma.managerDao.findMany({
    where: communityWhere(query),
    orderBy: [{ createdLedger: 'desc' }, { daoId: 'asc' }],
    skip: query.page * query.take,
    take: query.take + 1
  });
  return {
    deploymentId: DEPLOYMENT_ID,
    network: getDeploymentConfig().name,
    communities: rows.slice(0, query.take).map(marketplaceCommunity),
    hasMore: query.page < MARKETPLACE_MAX_PAGE && rows.length > query.take
  };
}

/** Global discovery is deployment-scoped, then every offer is checked against its scoped DAO registry. */
export async function marketplaceOffers(
  params: URLSearchParams,
  dao?: MarketplaceCommunity
): Promise<MarketplaceOffers> {
  const query = parseMarketplaceQuery(params);
  const communities = dao
    ? [dao]
    : (await prisma.managerDao.findMany({ where: communityWhere(query) })).map(marketplaceCommunity);
  const scoped = communities
    .filter((c) => c.marketplaceContract)
    .map((c) => marketplaceScope(DEPLOYMENT_ID, c.daoId, c.marketplaceContract!));
  if (!scoped.length) return { deploymentId: DEPLOYMENT_ID, communities, listings: [], hasMore: false };
  const where = {
    deploymentId: DEPLOYMENT_ID,
    OR: scoped,
    ...(query.status === 'all' ? {} : { status: query.status })
  };
  // Each page is one batch per listing kind. No cross-kind cursor can confuse token and listing ids.
  const take = query.kind === 'all' ? 12 : 24;
  const options = {
    where,
    orderBy: [{ createdLedger: 'desc' as const }, { eventId: 'desc' as const }],
    skip: query.page * take,
    take: take + 1
  };
  const [primary, secondary] = await Promise.all([
    query.kind === 'secondary' ? [] : prisma.marketplacePrimaryListing.findMany(options),
    query.kind === 'primary' ? [] : prisma.marketplaceSecondaryListing.findMany(options)
  ]);
  const listings = [
    ...primary.slice(0, take).map((r) => mapListing(r, 'primary')),
    ...secondary.slice(0, take).map((r) => mapListing(r, 'secondary'))
  ];
  const identities = new Map(communities.map((c) => [c.daoId, c]));
  for (const listing of listings) {
    const identity = identities.get(listing.daoId);
    if (!identity) throw new MarketplaceError('Listing has no scoped community.', 503);
    assertMarketplaceIdentity(listing, identity);
  }
  const listedDaos = new Set(listings.map((listing) => listing.daoId));
  return {
    deploymentId: DEPLOYMENT_ID,
    communities: dao ? communities : communities.filter((c) => listedDaos.has(c.daoId)),
    listings,
    hasMore: query.page < MARKETPLACE_MAX_PAGE && (primary.length > take || secondary.length > take)
  };
}

export async function marketplaceListing(
  community: MarketplaceCommunity,
  kind: 'primary' | 'secondary',
  id: string,
  eventId: string
) {
  let parsed: bigint;
  try {
    parsed = marketplaceId(id, kind);
  } catch {
    throw new MarketplaceError('Invalid listing identifier.', 400);
  }
  const scope = marketplaceScope(DEPLOYMENT_ID, community.daoId, community.marketplaceContract ?? '');
  if (!eventId || eventId.length > 250) throw new MarketplaceError('A listing event identity is required.', 400);
  const where = { ...scope, eventId };
  const row =
    kind === 'primary'
      ? await prisma.marketplacePrimaryListing.findFirst({ where: { ...where, listingId: parsed } })
      : await prisma.marketplaceSecondaryListing.findFirst({ where: { ...where, tokenId: parsed } });
  if (!row) throw new MarketplaceError('Listing not found in this community.', 404);
  const listing = mapListing(row, kind);
  assertMarketplaceIdentity(listing, community);
  return listing;
}

export async function daoMarketplace(daoId: string, params: URLSearchParams): Promise<DaoMarketplace> {
  const community = await marketplaceDao(daoId);
  const network = getDeploymentConfig();
  const query = parseMarketplaceQuery(params);
  if (!community.marketplaceContract)
    return {
      deploymentId: DEPLOYMENT_ID,
      network: network.name,
      community,
      communities: [community],
      launched: false,
      openedAtLaunch: null,
      config: null,
      configError: null,
      listings: [],
      hasMore: false,
      sales: [],
      salesHasMore: false
    };
  const scope = marketplaceScope(DEPLOYMENT_ID, daoId, community.marketplaceContract);
  const [offers, launch, sales, configRead] = await Promise.all([
    marketplaceOffers(params, community),
    prisma.marketplaceModuleLaunch.findFirst({
      where: {
        deploymentId: DEPLOYMENT_ID,
        daoId,
        moduleRole: 'marketplace',
        moduleContract: community.marketplaceContract
      }
    }),
    prisma.marketplaceSale.findMany({
      where: scope,
      orderBy: [{ eventLedger: 'desc' }, { eventId: 'desc' }],
      skip: query.page * 24,
      take: 25
    }),
    marketplaceClient(community)
      .get_config()
      .then(({ result }) => ({ result, error: null }))
      .catch(() => ({
        result: null,
        error: 'Live marketplace configuration is unavailable. Trading is disabled until it can be verified.'
      }))
  ]);
  const config = configRead.result;
  if (
    config &&
    (config.token !== community.tokenContract ||
      config.treasury !== community.treasuryContract ||
      config.manager !== network.managerAddress)
  )
    throw new MarketplaceError('Marketplace contract wiring does not match this DAO.', 503);
  return {
    ...offers,
    network: network.name,
    community,
    launched: launch?.isLive === true,
    openedAtLaunch: launch?.opened ?? null,
    configError: configRead.error,
    config: config
      ? {
          paymentAsset: config.payment_asset,
          feeBps: config.default_secondary_fee_bps,
          paused: config.paused,
          treasury: config.treasury,
          token: config.token
        }
      : null,
    sales: sales.slice(0, 24).map((r) => {
      assertMarketplaceIdentity(r, community);
      if (r.saleType !== 'primary' && r.saleType !== 'secondary') throw new MarketplaceError('Invalid sale type.', 503);
      return {
        eventId: r.eventId,
        kind: r.saleType,
        listingId: r.listingId?.toString() ?? null,
        tokenId: r.tokenId.toString(),
        price: r.price.toFixed(0),
        fee: r.fee?.toFixed(0) ?? null,
        paymentAsset: r.paymentAsset,
        buyer: r.buyer,
        seller: r.seller,
        at: r.eventAt?.toISOString() ?? null,
        transactionHash: r.transactionHash
      };
    }),
    salesHasMore: query.page < MARKETPLACE_MAX_PAGE && sales.length > 24
  };
}
