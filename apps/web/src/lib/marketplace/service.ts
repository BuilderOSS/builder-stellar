import { Client as MarketplaceClient } from '@builder-stellar/marketplace-bindings';
import type { ManagerDao, MarketplacePool, MarketplaceSecondaryListing } from '@prisma/client';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentNetwork, verifyRows } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';
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
  MarketplaceComments,
  MarketplaceCommunity,
  MarketplaceDirectory,
  MarketplaceListing,
  MarketplaceOffers
} from './types';

/** `description`: a plain summary of the verified profile, or empty (never unverified text). */
export function marketplaceCommunity(row: ManagerDao, description = ''): MarketplaceCommunity {
  if (row.deploymentId !== DEPLOYMENT_ID || row.daoId !== row.tokenContract || row.tokenAddress !== row.daoId) {
    throw new MarketplaceError('Indexed community identity is invalid.', 503);
  }
  return {
    deploymentId: row.deploymentId,
    daoId: row.daoId,
    name: row.tokenName || 'Unnamed community',
    symbol: row.tokenSymbol || '',
    description,
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

function mapListing(row: MarketplaceSecondaryListing): MarketplaceListing {
  return {
    deploymentId: row.deploymentId,
    daoId: row.daoId,
    contractId: row.contractId,
    eventId: row.eventId,
    kind: 'secondary',
    id: row.tokenId.toString(),
    tokenId: row.tokenId.toString(),
    price: row.price.toFixed(0),
    paymentAsset: row.paymentAsset,
    feeBps: row.feeBps,
    seller: row.seller,
    buyer: row.buyer,
    expiresAt: row.expiresAt.toString(),
    status: listingStatus(row.status, row.expiresAt.toString()),
    createdAt: row.createdAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    transactionHash: row.createdTransactionHash
  };
}

/** A pool as an offer: no seller or fee (the price goes to the Treasury), the token picked at purchase. */
function mapPool(row: MarketplacePool): MarketplaceListing {
  const count = (value: bigint) => Number(value);
  const status = listingStatus(row.status, row.expiresAt.toString());
  return {
    deploymentId: row.deploymentId,
    daoId: row.daoId,
    contractId: row.contractId,
    eventId: row.eventId,
    kind: 'pool',
    id: row.poolId.toString(),
    tokenId: null,
    price: row.price.toFixed(0),
    paymentAsset: row.asset,
    feeBps: 0,
    seller: null,
    buyer: null,
    expiresAt: row.expiresAt.toString(),
    status: status === 'open' && row.sold >= row.size ? 'sold-out' : status,
    createdAt: row.openedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    transactionHash: row.openedTransactionHash,
    pool: {
      size: count(row.size),
      stocked: count(row.stocked),
      sold: count(row.sold),
      inStock: count(row.inStock),
      maxPerBuyer: count(row.maxPerBuyer),
      maxSoldPerPeriod: count(row.maxSoldPerPeriod),
      periodSecs: count(row.periodSecs)
    }
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
            // The raw profile JSON: matches the description and link labels.
            { profile: { contains: query.search, mode: 'insensitive' as const } }
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
  const page = rows.slice(0, query.take);
  const profiles = await verifyRows(getDeploymentNetwork(), page);
  return {
    deploymentId: DEPLOYMENT_ID,
    network: getDeploymentConfig().name,
    communities: page.map((row) =>
      marketplaceCommunity(row, plainSummary(profiles.get(row.daoId)?.profile.description ?? ''))
    ),
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
    : (await prisma.managerDao.findMany({ where: communityWhere(query) })).map((row) => marketplaceCommunity(row));
  const scoped = communities
    .filter((c) => c.marketplaceContract)
    .map((c) => marketplaceScope(DEPLOYMENT_ID, c.daoId, c.marketplaceContract!));
  if (!scoped.length) return { deploymentId: DEPLOYMENT_ID, communities, listings: [], hasMore: false };
  // A pool is `open` or `closed`; a resale is open, purchased, cancelled or expired.
  const poolStatus = query.status === 'all' ? {} : { status: query.status === 'open' ? 'open' : 'closed' };
  const listingStatusFilter = query.status === 'all' || query.status === 'closed' ? {} : { status: query.status };
  // Each page is one batch per kind. No cross-kind cursor can confuse token and pool ids.
  const take = query.kind === 'all' ? 12 : 24;
  const page = { skip: query.page * take, take: take + 1 };
  const [pools, secondary] = await Promise.all([
    query.kind === 'secondary' || (query.status !== 'all' && !['open', 'closed'].includes(query.status))
      ? []
      : prisma.marketplacePool.findMany({
          where: { deploymentId: DEPLOYMENT_ID, OR: scoped, ...poolStatus },
          orderBy: [{ openedLedger: 'desc' }, { eventId: 'desc' }],
          ...page
        }),
    query.kind === 'pool' || query.status === 'closed'
      ? []
      : prisma.marketplaceSecondaryListing.findMany({
          where: { deploymentId: DEPLOYMENT_ID, OR: scoped, ...listingStatusFilter },
          orderBy: [{ createdLedger: 'desc' }, { eventId: 'desc' }],
          ...page
        })
  ]);
  const listings = [...pools.slice(0, take).map(mapPool), ...secondary.slice(0, take).map(mapListing)];
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
    hasMore: query.page < MARKETPLACE_MAX_PAGE && (pools.length > take || secondary.length > take)
  };
}

export async function marketplaceListing(
  community: MarketplaceCommunity,
  kind: 'pool' | 'secondary',
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
  const listing =
    kind === 'pool'
      ? await prisma.marketplacePool
          .findFirst({ where: { ...where, poolId: parsed } })
          .then((row) => row && mapPool(row))
      : await prisma.marketplaceSecondaryListing
          .findFirst({ where: { ...where, tokenId: parsed } })
          .then((row) => row && mapListing(row));
  if (!listing) throw new MarketplaceError('Listing not found in this community.', 404);
  assertMarketplaceIdentity(listing, community);
  return listing;
}

/**
 * Event-only comments on a resale, oldest first, by token id (so the thread carries over
 * relistings). Pools carry no comments.
 */
export async function marketplaceComments(
  community: MarketplaceCommunity,
  kind: 'pool' | 'secondary',
  id: string
): Promise<MarketplaceComments> {
  if (kind !== 'secondary') throw new MarketplaceError('Only resale listings have comments.', 400);
  let parsed: bigint;
  try {
    parsed = marketplaceId(id, kind);
  } catch {
    throw new MarketplaceError('Invalid listing identifier.', 400);
  }
  const scope = marketplaceScope(DEPLOYMENT_ID, community.daoId, community.marketplaceContract ?? '');
  const orderBy = [
    { eventLedger: 'asc' as const },
    { transactionIndex: 'asc' as const },
    { eventIndex: 'asc' as const }
  ];
  const rows = await prisma.marketplaceListingComment.findMany({
    where: { ...scope, tokenId: parsed },
    orderBy,
    take: 200
  });
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId: community.daoId,
    items: rows.map((row) => ({
      id: row.commentEventId,
      author: row.author,
      body: row.body,
      timestamp: row.eventAt?.getTime() ? Math.floor(row.eventAt.getTime() / 1000) : null,
      txHash: row.transactionHash
    }))
  };
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
      if (r.saleType !== 'pool' && r.saleType !== 'secondary') throw new MarketplaceError('Invalid sale type.', 503);
      return {
        eventId: r.eventId,
        kind: r.saleType,
        poolId: r.poolId?.toString() ?? null,
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
