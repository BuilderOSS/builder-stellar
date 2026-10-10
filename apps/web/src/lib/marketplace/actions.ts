import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Asset, BASE_FEE, Operation, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { z } from 'zod';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { prisma } from '@/lib/prisma';

import { formatMarketplaceAmount, marketplaceFee, marketplaceId, parseMarketplaceAmount } from './amount';
import { assertMarketplacePurchaseAuthorization, STALE_PURCHASE } from './purchase-authorization';
import { assertSecondaryPurchaseCycle } from './purchase-cycle';
import { MarketplaceError, marketplaceScope, matchesSnapshot } from './query';
import { marketplaceAsset, marketplaceHorizon, marketplaceReadiness } from './readiness';
import { marketplaceClient, marketplaceDao, marketplaceListing } from './service';
import type { MarketplaceAction, MarketplacePrepared } from './types';

export const marketplaceActionSchema = z.union([
  z
    .object({
      action: z.enum(['buy', 'cancel', 'expire']),
      kind: z.enum(['primary', 'secondary']),
      id: z.string().max(20),
      eventId: z.string().min(1).max(250)
    })
    .strict(),
  z
    .object({
      action: z.enum(['approve', 'list']),
      tokenId: z.string().max(10),
      price: z.string().max(60),
      expiresAt: z.string().max(20),
      paymentAsset: z.string().length(56),
      feeBps: z.number().int().min(0).max(10_000)
    })
    .strict(),
  z.object({ action: z.literal('revoke'), tokenId: z.string().max(10) }).strict(),
  z.object({ action: z.literal('trustline'), paymentAsset: z.string().length(56) }).strict()
]);

/** toXdr alone does not throw on a failed simulation. Validate simulation data first. */
export function marketplaceTransactionXdr<T>(transaction: AssembledTransaction<T>) {
  void transaction.simulationData;
  if (transaction.needsNonInvokerSigningBy().some((address) => address.startsWith('G'))) {
    throw new MarketplaceError('This trade unexpectedly requires another account signature. Nothing was submitted.');
  }
  return transaction.toXdr();
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
    throw new MarketplaceError('Marketplace wiring does not match this community.', 503);
  }
  const token = new TokenClient({
    contractId: config.token,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    publicKey: actor.address,
    allowHttp: network.name === 'local'
  });
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
      summary = `Revoke the current single-token approval for token #${tokenId} immediately (expiration ledger 0). No token is transferred.`;
    } else {
      if (!launch?.isLive || config.paused)
        throw new MarketplaceError('New listings require a launched, unpaused marketplace.');
      if (config.payment_asset !== action.paymentAsset || config.default_secondary_fee_bps !== action.feeBps) {
        throw new MarketplaceError('The payment asset or fee changed. Refresh and review the new terms.', 409);
      }
      if (!marketplaceAsset(network.name, action.paymentAsset))
        throw new MarketplaceError('Only verified XLM and USDC SAC assets are supported.');
      const price = parseMarketplaceAmount(action.price);
      if (!/^\d{1,20}$/.test(action.expiresAt)) throw new MarketplaceError('Invalid expiry.');
      const expiry = BigInt(action.expiresAt);
      const latest = await server.getLatestLedger();
      if (expiry <= BigInt(Math.floor(Date.now() / 1000)) || expiry > (1n << 64n) - 1n)
        throw new MarketplaceError('Choose a future expiry.');
      const readiness = await marketplaceReadiness(actor.address, network.name, paymentAsset);
      if (!readiness.trustline || !readiness.authorized) throw new MarketplaceError(readiness.issues.join(' '));
      const sellerProceeds = price - marketplaceFee(price.toString(), action.feeBps);
      if (
        !marketplaceAsset(network.name, paymentAsset)?.isNative &&
        (readiness.receivable === null || BigInt(readiness.receivable) < sellerProceeds)
      ) {
        throw new MarketplaceError(
          'Your USDC trustline has insufficient capacity to receive these sale proceeds. Increase its limit before listing.'
        );
      }
      xdr =
        action.action === 'approve'
          ? marketplaceTransactionXdr(
              await token.approve(
                {
                  owner: actor.address,
                  spender: scope.contractId,
                  token_id: tokenId,
                  expiration_ledger: latest.sequence + 120
                },
                options
              )
            )
          : marketplaceTransactionXdr(
              await client.list({ token_id: tokenId, seller: actor.address, price, expires_at: expiry }, options)
            );
      summary =
        action.action === 'approve'
          ? `Approve only token #${tokenId} for the marketplace until ledger ${latest.sequence + 120}. This does not list or escrow the token.`
          : `Escrow token #${tokenId} for ${formatMarketplaceAmount(price)} ${readiness.assetCode}. ${action.feeBps} bps is deducted from the sale price. Expires ${new Date(Number(expiry) * 1000).toISOString()}. The asset and fee are captured at execution: a governance change before confirmation can change them. Review the confirmed listing and cancel it if its terms are unsuitable.`;
    }
  } else if ('kind' in action) {
    const indexed = await marketplaceListing(community, action.kind, action.id, action.eventId);
    if (indexed.status !== 'open' && indexed.status !== 'awaiting-expiry')
      throw new MarketplaceError('This listing is already closed.', 409);
    const id = marketplaceId(action.id, action.kind);
    const live =
      action.kind === 'primary'
        ? (await client.get_primary_listing({ listing_id: id })).result
        : (await client.get_listing({ token_id: Number(id) })).result;
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
      const simulated =
        action.kind === 'primary'
          ? await client.buy_primary({ listing_id: id, buyer: actor.address }, options)
          : await client.buy({ token_id: Number(id), buyer: actor.address }, options);
      xdr = marketplaceTransactionXdr<void | number>(simulated);
      assertMarketplacePurchaseAuthorization(
        xdr,
        network.networkPassphrase,
        indexed,
        actor.address,
        config.treasury,
        simulated.simulationData.result.auth
      );
      if (action.kind === 'secondary') {
        const creation = await prisma.marketplaceSecondaryListing.findFirst({
          where: { ...scope, tokenId: id, eventId: action.eventId },
          select: { createdLedger: true, createdTransactionHash: true }
        });
        if (!creation) throw new MarketplaceError(STALE_PURCHASE, 409);
        await assertSecondaryPurchaseCycle(indexed, creation, simulated.simulation, client, server);
      }

      // A token id is reusable for secondary listings. Recheck the exact indexed
      // creation event, and live fee/expiry too (rounding can hide a fee change in
      // an otherwise identical payment tree). Never fall back to a token-only quote.
      const [afterIndexed, afterLive] = await Promise.all([
        marketplaceListing(community, action.kind, action.id, action.eventId),
        action.kind === 'primary'
          ? client.get_primary_listing({ listing_id: id })
          : client.get_listing({ token_id: Number(id) })
      ]);
      if (
        afterIndexed.eventId !== indexed.eventId ||
        afterIndexed.status !== 'open' ||
        !afterLive.result ||
        !matchesSnapshot(indexed, afterLive.result)
      ) {
        throw new MarketplaceError(STALE_PURCHASE, 409);
      }
      summary = `Pay ${formatMarketplaceAmount(live.price)} ${asset.code}. ${
        action.kind === 'primary'
          ? `Proceeds go to Treasury ${config.treasury}; one new NFT is minted directly to your account.`
          : `Receive escrowed token #${id}; the seller pays the snapshotted ${indexed.feeBps} bps fee from the price.`
      }`;
    } else if (action.action === 'cancel') {
      if (action.kind === 'primary')
        throw new MarketplaceError('Primary cancellations must be proposed through DAO governance.');
      if (indexed.seller !== actor.address) throw new MarketplaceError('Only the seller can cancel this listing.', 403);
      xdr = marketplaceTransactionXdr(await client.cancel({ token_id: Number(id), seller: actor.address }, options));
      summary = `Cancel the secondary listing and return token #${id} to its seller. No sale payment is made.`;
    } else {
      if (live.expires_at > BigInt(Math.floor(Date.now() / 1000)))
        throw new MarketplaceError('The listing has not expired yet.');
      xdr =
        action.kind === 'primary'
          ? marketplaceTransactionXdr(await client.expire_primary({ listing_id: id }, options))
          : marketplaceTransactionXdr(await client.expire({ token_id: Number(id) }, options));
      summary =
        action.kind === 'primary'
          ? `Clear expired primary listing #${id}. No token was minted.`
          : `Recover expired listing #${id}. The escrowed token returns to its original seller, not the caller.`;
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
