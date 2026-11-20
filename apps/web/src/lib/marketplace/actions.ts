import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Asset, BASE_FEE, Operation, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { z } from 'zod';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { shortAddress } from '@/lib/activity-feed';
import { commentBytes, MAX_COMMENT_BYTES } from '@/lib/comments';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { prisma } from '@/lib/prisma';
import { throwIfRestoreNeeded } from '@/lib/restore-required';

import {
  formatFeePercent,
  formatMarketplaceAmount,
  marketplaceFee,
  marketplaceId,
  parseMarketplaceAmount
} from './amount';
import { APPROVAL_EXPIRED } from './errors';
import { assertMarketplacePurchaseAuthorization, STALE_PURCHASE } from './purchase-authorization';
import { assertSecondaryPurchaseCycle } from './purchase-cycle';
import { MarketplaceError, marketplaceScope, matchesPoolSnapshot, matchesSnapshot } from './query';
import { marketplaceAsset, marketplaceHorizon, marketplaceReadiness } from './readiness';
import { marketplaceClient, marketplaceDao, marketplaceListing } from './service';
import type { MarketplaceAction, MarketplaceApproval, MarketplaceListing, MarketplacePrepared } from './types';

export const marketplaceActionSchema = z.union([
  z
    .object({
      action: z.enum(['buy', 'cancel', 'expire']),
      kind: z.enum(['pool', 'secondary']),
      id: z.string().max(20),
      eventId: z.string().min(1).max(250)
    })
    .strict(),
  z
    .object({
      action: z.literal('restock'),
      kind: z.literal('pool'),
      id: z.string().max(20),
      eventId: z.string().min(1).max(250)
    })
    .strict(),
  z
    .object({
      action: z.literal('list'),
      tokenId: z.string().max(10),
      price: z.string().max(60),
      expiresAt: z.string().max(20),
      paymentAsset: z.string().length(56),
      feeBps: z.number().int().min(0).max(2_500)
    })
    .strict(),
  z.object({ action: z.enum(['approve', 'revoke']), tokenId: z.string().max(10) }).strict(),
  z.object({ action: z.literal('trustline'), paymentAsset: z.string().length(56) }).strict(),
  z
    .object({
      action: z.literal('comment'),
      kind: z.literal('secondary'),
      id: z.string().max(20),
      body: z.string().min(1).max(MAX_COMMENT_BYTES)
    })
    .strict()
]);

type PoolClient = ReturnType<typeof marketplaceClient>;

/**
 * The first token in a pool's stock, with its page: `buy_from_pool` names both. Pages fill in
 * order and only shrink, so the first non-empty page is cheap to find. Null when nothing is
 * stocked (anyone can restock an open pool with an unstocked rest).
 */
async function pickPoolToken(client: PoolClient, poolId: number): Promise<{ page: number; tokenId: number } | null> {
  const slots = (await client.open_pools()).result;
  const slot = slots.find((item) => item.pool_id === poolId);
  if (!slot) return null;
  for (let page = 0; page < slot.pages; page += 1) {
    const ids = (await client.pool_stock({ pool_id: poolId, page })).result;
    if (ids.length) return { page, tokenId: ids[0]! };
  }
  return null;
}

async function livePool(client: PoolClient, indexed: MarketplaceListing, poolId: number) {
  const live = (await client.get_pool({ pool_id: poolId })).result;
  if (!live || !matchesPoolSnapshot(indexed, live))
    throw new MarketplaceError('This pool changed or closed. Refresh before signing.', 409);
  return live;
}

/** toXdr alone does not throw on a failed simulation. Validate simulation data first. */
export function marketplaceTransactionXdr<T>(transaction: AssembledTransaction<T>) {
  throwIfRestoreNeeded(transaction);
  void transaction.simulationData;
  if (transaction.needsNonInvokerSigningBy().some((address) => address.startsWith('G'))) {
    throw new MarketplaceError('This trade unexpectedly requires another account signature. Nothing was submitted.');
  }
  return transaction.toXdr();
}

/** About 1 hour of ledgers (one every 5 seconds): time to review and sign the List step. */
export const APPROVAL_LEDGERS = 720;

type TokenReader = Pick<TokenClient, 'get_approved' | 'is_approved_for_all'>;

/** Whether `market` may move `tokenId` for `owner` now: a live single-token or all-token approval. */
export async function marketplaceMayMove(token: TokenReader, owner: string, market: string, tokenId: number) {
  const [single, all] = await Promise.all([
    token.get_approved({ token_id: tokenId }),
    token.is_approved_for_all({ owner, operator: market })
  ]);
  return single.result === market || all.result === true;
}

function tokenClient(contractId: string, publicKey: string) {
  const network = getDeploymentConfig();
  return new TokenClient({
    contractId,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    publicKey,
    allowHttp: network.name === 'local'
  });
}

/** Read on chain before the List step: is the market still allowed to move this token? */
export async function marketplaceApproval(
  daoId: string,
  actor: { address: string; network: string },
  rawTokenId: string
): Promise<MarketplaceApproval> {
  const network = getDeploymentConfig();
  if (actor.network !== network.name) throw new MarketplaceError('Authenticate on this deployment network.', 401);
  let tokenId: number;
  try {
    tokenId = Number(marketplaceId(rawTokenId, 'secondary'));
  } catch {
    throw new MarketplaceError('Invalid token identifier.', 400);
  }
  const community = await marketplaceDao(daoId);
  if (!community.marketplaceContract) throw new MarketplaceError('This tribe has no marketplace.', 404);
  const token = tokenClient(community.tokenContract, actor.address);
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId,
    address: actor.address,
    tokenId: String(tokenId),
    approved: await marketplaceMayMove(token, actor.address, community.marketplaceContract, tokenId)
  };
}

export async function prepareMarketplaceAction(
  daoId: string,
  actor: { address: string; network: string },
  action: MarketplaceAction
): Promise<MarketplacePrepared> {
  const network = getDeploymentConfig();
  if (actor.network !== network.name)
    throw new MarketplaceError('Authenticate on the deployment network before trading.', 401);
  const community = await marketplaceDao(daoId);
  const client = marketplaceClient(community, actor.address);
  const server = new rpc.Server(network.rpcUrl, { allowHttp: network.name === 'local' });
  const scope = marketplaceScope(DEPLOYMENT_ID, daoId, community.marketplaceContract ?? '');
  const [launch, { result: config }] = await Promise.all([
    prisma.marketplaceModuleLaunch.findFirst({
      where: { deploymentId: DEPLOYMENT_ID, daoId, moduleRole: 'marketplace', moduleContract: scope.contractId }
    }),
    client.get_config()
  ]);
  if (
    config.token !== community.tokenContract ||
    config.treasury !== community.treasuryContract ||
    config.manager !== network.managerAddress
  ) {
    throw new MarketplaceError('Marketplace wiring does not match this tribe.', 503);
  }
  const token = tokenClient(config.token, actor.address);
  // SDK MethodOptions.restore defaults to false. No server signer or automatic submit is installed.
  const options = { timeoutInSeconds: 180 };
  let xdr: string;
  let summary: string;
  let paymentAsset = config.payment_asset;
  let purchasePrice = 0n;
  if (action.action === 'trustline') {
    const asset = marketplaceAsset(network.name, action.paymentAsset);
    if (!asset || asset.isNative || !asset.issuer)
      throw new MarketplaceError('This asset does not support adding a trustline.');
    const readiness = await marketplaceReadiness(actor.address, network.name, action.paymentAsset);
    if (readiness.trustline) throw new MarketplaceError('This account already has the trustline.');
    if (!readiness.canAddTrustline)
      throw new MarketplaceError('Add more XLM for the trustline reserve and network fee.');
    const account = await marketplaceHorizon(network.name).loadAccount(actor.address);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: network.networkPassphrase })
      .addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }))
      .setTimeout(180)
      .build();
    xdr = tx.toXDR();
    summary = `Add a ${asset.code} trustline to issuer ${asset.issuer}. This increases your XLM reserve.`;
    paymentAsset = action.paymentAsset;
  } else if (action.action === 'approve' || action.action === 'list' || action.action === 'revoke') {
    const tokenId = Number(marketplaceId(action.tokenId, 'secondary'));
    // A locked community refuses holder approvals and listings (TransfersLocked): say so before simulating.
    if (action.action !== 'revoke' && (await token.transfers_locked()).result)
      throw new MarketplaceError(
        'Memberships in this tribe are locked: tokens move only by sale from the tribe, by giving them back to the DAO or by a DAO vote.'
      );
    const { result: owner } = await token.owner_of({ token_id: tokenId });
    if (owner !== actor.address)
      throw new MarketplaceError('You no longer own this token. Refresh your inventory.', 409);
    if (action.action === 'revoke') {
      // Pinned NFT Base::approve_for_owner explicitly removes the approval when expiration_ledger is zero.
      xdr = marketplaceTransactionXdr(
        await token.approve(
          { owner: actor.address, spender: scope.contractId, token_id: tokenId, expiration_ledger: 0 },
          options
        )
      );
      summary = `Remove the market's permission to move token #${tokenId}, starting now. Your token stays with you.`;
    } else if (action.action === 'approve') {
      // The Allow step checks only the token: the price and end are checked when you list.
      if (!launch?.isLive || config.paused)
        throw new MarketplaceError('New listings require a launched, unpaused marketplace.');
      const latest = await server.getLatestLedger();
      xdr = marketplaceTransactionXdr(
        await token.approve(
          {
            owner: actor.address,
            spender: scope.contractId,
            token_id: tokenId,
            expiration_ledger: latest.sequence + APPROVAL_LEDGERS
          },
          options
        )
      );
      summary = `Allow the market to move token #${tokenId} into its care for about 1 hour. This doesn't list it or move it yet. Your token only moves when you sign the next step, List for sale.`;
    } else {
      if (!launch?.isLive || config.paused)
        throw new MarketplaceError('New listings require a launched, unpaused marketplace.');
      if (config.payment_asset !== action.paymentAsset || config.default_secondary_fee_bps !== action.feeBps) {
        throw new MarketplaceError('The payment asset or fee changed. Refresh and review the new terms.', 409);
      }
      const asset = marketplaceAsset(network.name, action.paymentAsset);
      if (!asset) throw new MarketplaceError('Only verified XLM and USDC SAC assets are supported.');
      const price = parseMarketplaceAmount(action.price);
      if (!/^\d{1,20}$/.test(action.expiresAt)) throw new MarketplaceError('Invalid expiry.');
      const expiry = BigInt(action.expiresAt);
      if (expiry <= BigInt(Math.floor(Date.now() / 1000)) || expiry > (1n << 64n) - 1n)
        throw new MarketplaceError('Choose a future expiry.');
      const readiness = await marketplaceReadiness(actor.address, network.name, paymentAsset);
      if (!readiness.trustline || !readiness.authorized) throw new MarketplaceError(readiness.issues.join(' '));
      const fee = marketplaceFee(price.toString(), action.feeBps);
      const sellerProceeds = price - fee;
      if (!asset.isNative && (readiness.receivable === null || BigInt(readiness.receivable) < sellerProceeds)) {
        throw new MarketplaceError(
          'Your USDC trustline has insufficient capacity to receive these sale proceeds. Increase its limit before listing.'
        );
      }
      // List moves the token with transfer_from, so the market needs a live permission first.
      if (!(await marketplaceMayMove(token, actor.address, scope.contractId, tokenId)))
        throw new MarketplaceError(APPROVAL_EXPIRED, 409);
      xdr = marketplaceTransactionXdr(
        await client.list(
          {
            token_id: tokenId,
            seller: actor.address,
            price,
            expires_at: expiry,
            // The seller's reviewed terms: the contract rejects the listing
            // if governance changed the fee or asset before confirmation.
            max_fee_bps: action.feeBps,
            payment_asset: action.paymentAsset
          },
          options
        )
      );
      summary = `List token #${tokenId} for ${formatMarketplaceAmount(price)} ${asset.code}. The market holds your token until it sells, you cancel, or the listing ends. When it sells, the ${formatFeePercent(action.feeBps)} resale fee (${formatMarketplaceAmount(fee)} ${asset.code}) comes out of the price and you receive ${formatMarketplaceAmount(sellerProceeds)} ${asset.code}. If the tribe changes the fee or price asset before this confirms, the listing fails and nothing changes. While it's listed, the token's vote pauses.`;
    }
  } else if (action.action === 'comment') {
    // Event-only: the marketplace emits the comment and stores nothing. Anyone may comment on a resale.
    if (!action.body.trim() || commentBytes(action.body) > MAX_COMMENT_BYTES)
      throw new MarketplaceError('Comments need some text and must fit in 1 KB.');
    if (/[\r\n]/.test(action.body)) throw new MarketplaceError('Listing comments are one line of plain text.');
    let id: bigint;
    try {
      id = marketplaceId(action.id, 'secondary');
    } catch {
      throw new MarketplaceError('Invalid listing identifier.', 400);
    }
    xdr = marketplaceTransactionXdr(
      await client.comment_listing({ token_id: Number(id), body: action.body, author: actor.address }, options)
    );
    summary = `Post a public comment on token #${id}. Everyone can read it, and it can't be edited or deleted.`;
  } else if ('kind' in action && action.kind === 'pool') {
    const indexed = await marketplaceListing(community, 'pool', action.id, action.eventId);
    if (indexed.status !== 'open') throw new MarketplaceError('This pool is not selling.', 409);
    const poolId = Number(marketplaceId(action.id, 'pool'));
    const live = await livePool(client, indexed, poolId);
    paymentAsset = live.asset;
    if (live.expires_at <= BigInt(Math.floor(Date.now() / 1000))) throw new MarketplaceError('This pool has closed.');
    if (!launch?.isLive || config.paused)
      throw new MarketplaceError('Pools sell only from a launched, unpaused marketplace.');
    if (action.action === 'restock') {
      xdr = marketplaceTransactionXdr(await client.restock({ pool_id: poolId }, options));
      summary = `Mint the next tokens of pool ${poolId} into the marketplace so they can be bought. Anyone can do this; it costs only the network fee.`;
    } else if (action.action === 'buy') {
      const bought = (await client.pool_purchases({ pool_id: poolId, buyer: actor.address })).result;
      if (bought >= live.max_per_buyer)
        throw new MarketplaceError(
          `You already bought the most this pool allows per wallet (${live.max_per_buyer}).`,
          409
        );
      const pick = await pickPoolToken(client, poolId);
      if (!pick) throw new MarketplaceError('Nothing is stocked in this pool right now. Restock it first.', 409);
      const asset = marketplaceAsset(network.name, paymentAsset);
      if (!asset) throw new MarketplaceError('Only verified XLM and USDC assets are supported.');
      purchasePrice = live.price;
      const simulated = await client.buy_from_pool(
        { pool_id: poolId, page: pick.page, token_id: pick.tokenId, buyer: actor.address, max_price: purchasePrice },
        options
      );
      xdr = marketplaceTransactionXdr<void>(simulated);
      assertMarketplacePurchaseAuthorization(
        xdr,
        network.networkPassphrase,
        indexed,
        actor.address,
        config.treasury,
        simulated.simulationData.result.auth,
        pick
      );
      // Recheck: the same pool terms and the picked token still in stock on its page.
      await livePool(client, indexed, poolId);
      const page = (await client.pool_stock({ pool_id: poolId, page: pick.page })).result;
      if (!page.includes(pick.tokenId)) throw new MarketplaceError(STALE_PURCHASE, 409);
      summary = `Pay ${formatMarketplaceAmount(live.price)} ${asset.code} to the tribe Treasury (${shortAddress(config.treasury)}) and receive token #${pick.tokenId} from pool ${poolId}.`;
    } else {
      throw new MarketplaceError('Pools are closed by DAO governance, not by buyers.');
    }
  } else if ('kind' in action && action.kind === 'secondary') {
    const indexed = await marketplaceListing(community, 'secondary', action.id, action.eventId);
    if (indexed.status !== 'open' && indexed.status !== 'awaiting-expiry')
      throw new MarketplaceError('This listing is already closed.', 409);
    const id = marketplaceId(action.id, 'secondary');
    const live = (await client.get_listing({ token_id: Number(id) })).result;
    if (!live || !matchesSnapshot(indexed, live))
      throw new MarketplaceError('This listing changed or closed. Refresh before signing.', 409);
    paymentAsset = live.payment_asset;
    if (action.action === 'buy') {
      if (!launch?.isLive || config.paused)
        throw new MarketplaceError('Purchases require a launched, unpaused marketplace.');
      if (live.expires_at <= BigInt(Math.floor(Date.now() / 1000)))
        throw new MarketplaceError('This listing has expired.');
      if (indexed.seller === actor.address) throw new MarketplaceError('You cannot buy your own secondary listing.');
      purchasePrice = live.price;
      const asset = marketplaceAsset(network.name, paymentAsset);
      if (!asset) throw new MarketplaceError('Only verified XLM and USDC SAC assets are supported.');
      const simulated = await client.buy(
        { token_id: Number(id), buyer: actor.address, max_price: purchasePrice },
        options
      );
      xdr = marketplaceTransactionXdr<void>(simulated);
      assertMarketplacePurchaseAuthorization(
        xdr,
        network.networkPassphrase,
        indexed,
        actor.address,
        config.treasury,
        simulated.simulationData.result.auth
      );
      const creation = await prisma.marketplaceSecondaryListing.findFirst({
        where: { ...scope, tokenId: id, eventId: action.eventId },
        select: { createdLedger: true, createdTransactionHash: true }
      });
      if (!creation) throw new MarketplaceError(STALE_PURCHASE, 409);
      await assertSecondaryPurchaseCycle(indexed, creation, simulated.simulation, client, server);

      // A token id is reusable for secondary listings. Recheck the exact indexed
      // creation event, and live fee/expiry too (rounding can hide a fee change in
      // an otherwise identical payment tree). Never fall back to a token-only quote.
      const [afterIndexed, afterLive] = await Promise.all([
        marketplaceListing(community, 'secondary', action.id, action.eventId),
        client.get_listing({ token_id: Number(id) })
      ]);
      if (
        afterIndexed.eventId !== indexed.eventId ||
        afterIndexed.status !== 'open' ||
        !afterLive.result ||
        !matchesSnapshot(indexed, afterLive.result)
      ) {
        throw new MarketplaceError(STALE_PURCHASE, 409);
      }
      summary = `Pay ${formatMarketplaceAmount(live.price)} ${asset.code} and receive token #${id}, which the market is holding for the seller. The seller pays the ${formatFeePercent(indexed.feeBps)} resale fee from the price.`;
    } else if (action.action === 'cancel') {
      if (indexed.seller !== actor.address) throw new MarketplaceError('Only the seller can cancel this listing.', 403);
      xdr = marketplaceTransactionXdr(await client.cancel({ token_id: Number(id), seller: actor.address }, options));
      summary = `Cancel your listing. Token #${id} comes back to you and no payment is made.`;
    } else {
      if (live.expires_at > BigInt(Math.floor(Date.now() / 1000)))
        throw new MarketplaceError('The listing has not expired yet.');
      xdr = marketplaceTransactionXdr(await client.expire({ token_id: Number(id) }, options));
      summary = `Close the ended listing of token #${id}. The market returns the token to its seller, not to the account that signs this.`;
    }
  } else {
    throw new MarketplaceError('Unsupported marketplace action.');
  }
  const transaction = TransactionBuilder.fromXDR(xdr, network.networkPassphrase);
  if (!('source' in transaction) || transaction.source !== actor.address)
    throw new MarketplaceError('Unexpected transaction source.', 503);
  const fee = BigInt(transaction.fee);
  // Always verify network fee funds. Asset funds/authorization matter only when paying the purchase price.
  const nativeId = Asset.native().contractId(network.networkPassphrase);
  const readiness = await marketplaceReadiness(
    actor.address,
    network.name,
    purchasePrice > 0n ? paymentAsset : nativeId
  );
  if (BigInt(readiness.nativeAvailable) < fee)
    throw new MarketplaceError('Add XLM above your account reserve for the simulated network fee.');
  if (
    purchasePrice > 0n &&
    (!readiness.trustline ||
      !readiness.authorized ||
      BigInt(readiness.available) < purchasePrice + (paymentAsset === nativeId ? fee : 0n))
  ) {
    throw new MarketplaceError(
      readiness.issues.join(' ') || `Insufficient spendable ${readiness.assetCode} for this purchase.`
    );
  }
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId,
    address: actor.address,
    network: network.name,
    networkPassphrase: network.networkPassphrase,
    rpcUrl: network.rpcUrl,
    xdr,
    summary,
    fee: fee.toString()
  };
}
