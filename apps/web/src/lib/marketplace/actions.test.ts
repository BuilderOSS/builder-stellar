import {
  Account,
  Asset,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  rpc,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dao: vi.fn(),
  listing: vi.fn(),
  client: {
    get_config: vi.fn(),
    get_pool: vi.fn(),
    open_pools: vi.fn(),
    pool_stock: vi.fn(),
    pool_purchases: vi.fn(),
    get_listing: vi.fn(),
    buy_from_pool: vi.fn(),
    restock: vi.fn(),
    buy: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
    expire: vi.fn(),
    secondaryListingCreatedEventFilter: vi.fn(),
    parseEvent: vi.fn()
  },
  token: { owner_of: vi.fn(), approve: vi.fn(), transfers_locked: vi.fn() },
  launch: vi.fn(),
  creation: vi.fn(),
  readiness: vi.fn(),
  horizonAccount: vi.fn()
}));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));
vi.mock('@/lib/deployment-config', () => ({
  getDeploymentConfig: () => ({
    name: 'testnet',
    rpcUrl: 'https://rpc.example',
    networkPassphrase: 'Test SDF Network ; September 2015',
    managerAddress: 'manager-a'
  })
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketplaceModuleLaunch: { findFirst: mocks.launch },
    marketplaceSecondaryListing: { findFirst: mocks.creation }
  }
}));
vi.mock('./service', () => ({
  marketplaceDao: mocks.dao,
  marketplaceClient: () => mocks.client,
  marketplaceListing: mocks.listing
}));
vi.mock('./readiness', async (original) => ({
  ...(await original<typeof import('./readiness')>()),
  marketplaceReadiness: mocks.readiness,
  marketplaceHorizon: () => ({ loadAccount: mocks.horizonAccount })
}));
vi.mock('@builder-stellar/token-bindings', () => ({
  Client: class {
    owner_of = mocks.token.owner_of;
    approve = mocks.token.approve;
    transfers_locked = mocks.token.transfers_locked;
  }
}));

import { getTreasuryAssets } from '@/lib/assets-config';

import { marketplaceActionSchema, marketplaceTransactionXdr, prepareMarketplaceAction } from './actions';
import {
  contractActionFixture,
  creationHistory,
  currentListingEntry,
  PURCHASE_MARKET,
  PURCHASE_TOKEN,
  PURCHASE_TREASURY,
  purchaseFixture,
  purchaseFixtureClient
} from './purchase-authorization.fixtures';
import type { MarketplaceAction, MarketplaceListing } from './types';

const buyer = Keypair.random().publicKey();
const seller = Keypair.random().publicKey();
const actor = { address: buyer, network: 'testnet' };
const xlm = Asset.native().contractId(Networks.TESTNET);
const usdc = getTreasuryAssets('testnet').find((a) => a.code === 'USDC')!.contractId!;
const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
const indexed: MarketplaceListing = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  contractId: PURCHASE_MARKET,
  eventId: 'cycle-one',
  kind: 'secondary',
  id: '7',
  tokenId: '7',
  price: '10000001',
  paymentAsset: usdc,
  feeBps: 250,
  seller,
  buyer: null,
  expiresAt: expiry.toString(),
  status: 'open',
  createdAt: null,
  closedAt: null,
  transactionHash: 'hash'
};
const poolListing: MarketplaceListing = {
  ...indexed,
  kind: 'pool',
  id: '4',
  tokenId: null,
  seller: null,
  feeBps: 0,
  eventId: 'pool-event',
  pool: { size: 3, stocked: 3, sold: 1, inStock: 2, maxPerBuyer: 1, maxSoldPerPeriod: 5, periodSecs: 3600 }
};
function transaction() {
  const xdr = new TransactionBuilder(new Account(buyer, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.manageData({ name: 'mock marketplace transaction', value: null }))
    .setTimeout(180)
    .build()
    .toXDR();
  return { simulationData: {}, needsNonInvokerSigningBy: () => [], toXdr: () => xdr };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.dao.mockResolvedValue({
    deploymentId: 'deployment-a',
    daoId: 'dao-a',
    marketplaceContract: PURCHASE_MARKET,
    tokenContract: PURCHASE_TOKEN,
    treasuryContract: PURCHASE_TREASURY
  });
  mocks.launch.mockResolvedValue({ isLive: true });
  mocks.creation.mockResolvedValue({ createdLedger: 900n, createdTransactionHash: indexed.transactionHash });
  mocks.client.secondaryListingCreatedEventFilter.mockImplementation((values) =>
    purchaseFixtureClient.secondaryListingCreatedEventFilter(values)
  );
  mocks.client.parseEvent.mockImplementation((topics, data) => purchaseFixtureClient.parseEvent(topics, data));
  mocks.client.get_config.mockResolvedValue({
    result: {
      token: PURCHASE_TOKEN,
      treasury: PURCHASE_TREASURY,
      manager: 'manager-a',
      payment_asset: xlm,
      default_secondary_fee_bps: 500,
      paused: false
    }
  });
  mocks.listing.mockResolvedValue(indexed);
  mocks.client.get_listing.mockResolvedValue({
    result: { price: 10000001n, payment_asset: usdc, expires_at: expiry, seller, fee_bps: 250 }
  });
  mocks.client.get_pool.mockResolvedValue({
    result: { price: 10000001n, asset: usdc, expires_at: expiry, size: 3, closed: false, max_per_buyer: 1 }
  });
  mocks.client.open_pools.mockResolvedValue({ result: [{ pool_id: 4, unstocked: 0, pages: 2 }] });
  mocks.client.pool_stock.mockImplementation(({ page }) => Promise.resolve({ result: page === 0 ? [] : [21, 22] }));
  mocks.client.pool_purchases.mockResolvedValue({ result: 0 });
  mocks.token.owner_of.mockResolvedValue({ result: buyer });
  mocks.token.transfers_locked.mockResolvedValue({ result: false });
  mocks.horizonAccount.mockResolvedValue(new Account(buyer, '1'));
  for (const fn of [
    mocks.token.approve,
    mocks.client.buy,
    mocks.client.buy_from_pool,
    mocks.client.restock,
    mocks.client.list,
    mocks.client.cancel,
    mocks.client.expire
  ])
    fn.mockResolvedValue(transaction());
  mocks.client.buy.mockImplementation(({ token_id }) =>
    Promise.resolve(purchaseFixture({ ...indexed, id: String(token_id) }, buyer))
  );
  mocks.client.buy_from_pool.mockImplementation(({ pool_id, page, token_id }) =>
    Promise.resolve(
      purchaseFixture({ ...poolListing, id: String(pool_id) }, buyer, undefined, { pick: { page, tokenId: token_id } })
    )
  );
  mocks.token.approve.mockImplementation(({ owner, spender, token_id, expiration_ledger }) =>
    Promise.resolve(
      contractActionFixture(
        PURCHASE_TOKEN,
        'approve',
        [
          nativeToScVal(owner, { type: 'address' }),
          nativeToScVal(spender, { type: 'address' }),
          nativeToScVal(token_id, { type: 'u32' }),
          nativeToScVal(expiration_ledger, { type: 'u32' })
        ],
        buyer
      )
    )
  );
  mocks.client.list.mockImplementation(({ token_id, seller: owner, price, expires_at }) =>
    Promise.resolve(
      contractActionFixture(
        PURCHASE_MARKET,
        'list',
        [
          nativeToScVal(token_id, { type: 'u32' }),
          nativeToScVal(owner, { type: 'address' }),
          nativeToScVal(price, { type: 'i128' }),
          nativeToScVal(expires_at, { type: 'u64' })
        ],
        buyer
      )
    )
  );
  mocks.readiness.mockResolvedValue({
    nativeAvailable: '1000000000',
    available: '1000000000',
    authorized: true,
    trustline: true,
    issues: [],
    assetCode: 'USDC'
  });
  // Only the sequence is consumed by approval preparation. No live ledger is loaded.
  vi.spyOn(rpc.Server.prototype, 'getLatestLedger').mockResolvedValue({
    id: 'hash',
    sequence: 1000,
    protocolVersion: '25'
  } as rpc.Api.GetLatestLedgerResponse);
  vi.spyOn(rpc.Server.prototype, 'getEvents').mockResolvedValue(creationHistory(indexed));
  vi.spyOn(rpc.Server.prototype, 'getLedgerEntries').mockResolvedValue(currentListingEntry(indexed));
});

describe('authenticated marketplace preparation lifecycle', () => {
  it('rejects spoofed wallet/body fields, mixed pool/token identifiers and invented actions', () => {
    const valid = { action: 'buy', kind: 'pool', id: '4', eventId: 'event' };
    expect(marketplaceActionSchema.parse(valid)).toEqual(valid);
    for (const body of [
      { ...valid, buyer },
      { ...valid, address: seller },
      { ...valid, tokenId: '7' },
      { action: 'create_primary_listing', price: '1' },
      { action: 'restock', kind: 'secondary', id: '7', eventId: 'event' },
      { action: 'comment', kind: 'pool', id: '4', body: 'hi' }
    ]) {
      expect(marketplaceActionSchema.safeParse(body).success).toBe(false);
    }
  });
  it('requires the authenticated deployment network before indexed or RPC reads', async () => {
    await expect(
      prepareMarketplaceAction(
        'dao-a',
        { ...actor, network: 'public' },
        { action: 'buy', kind: 'secondary', id: '7', eventId: 'cycle-one' }
      )
    ).rejects.toThrow('deployment network');
    expect(mocks.dao).not.toHaveBeenCalled();
  });
  it('a pool purchase picks the first stocked token and its page, pays the Treasury and pins both', async () => {
    mocks.listing.mockResolvedValue(poolListing);
    const result = await prepareMarketplaceAction('dao-a', actor, {
      action: 'buy',
      kind: 'pool',
      id: '4',
      eventId: 'pool-event'
    });
    expect(mocks.client.buy_from_pool).toHaveBeenCalledWith(
      { pool_id: 4, page: 1, token_id: 21, buyer, max_price: 10000001n },
      { timeoutInSeconds: 180 }
    );
    expect(mocks.client.buy).not.toHaveBeenCalled();
    expect(mocks.readiness).toHaveBeenCalledWith(buyer, 'testnet', usdc);
    expect(result.summary).toContain('1.0000001 USDC');
    expect(result.summary).toContain('token #21 from pool 4');
    expect(result.address).toBe(buyer);
    expect(result.fee).toBe('100');
  });
  it('refuses a pool purchase past the per-wallet cap, with no stock, or after the token left the page', async () => {
    mocks.listing.mockResolvedValue(poolListing);
    const buy = () =>
      prepareMarketplaceAction('dao-a', actor, { action: 'buy', kind: 'pool', id: '4', eventId: 'pool-event' });
    mocks.client.pool_purchases.mockResolvedValueOnce({ result: 1 });
    await expect(buy()).rejects.toThrow('per wallet');
    mocks.client.pool_stock.mockResolvedValue({ result: [] });
    await expect(buy()).rejects.toThrow('Restock');
    // Stocked at the pick, gone at the recheck.
    mocks.client.pool_stock.mockResolvedValueOnce({ result: [21] }).mockResolvedValueOnce({ result: [] });
    mocks.client.open_pools.mockResolvedValue({ result: [{ pool_id: 4, unstocked: 0, pages: 1 }] });
    await expect(buy()).rejects.toMatchObject({ status: 409 });
  });
  it('anyone may restock an open pool; nobody closes one from the trade flow', async () => {
    mocks.listing.mockResolvedValue(poolListing);
    const result = await prepareMarketplaceAction('dao-a', actor, {
      action: 'restock',
      kind: 'pool',
      id: '4',
      eventId: 'pool-event'
    });
    expect(mocks.client.restock).toHaveBeenCalledWith({ pool_id: 4 }, { timeoutInSeconds: 180 });
    expect(result.summary).toContain('Anyone can do this');
    await expect(
      prepareMarketplaceAction('dao-a', actor, { action: 'cancel', kind: 'pool', id: '4', eventId: 'pool-event' })
    ).rejects.toThrow('governance');
  });
  it('a locked community refuses approvals and listings before simulating', async () => {
    mocks.token.transfers_locked.mockResolvedValue({ result: true });
    await expect(
      prepareMarketplaceAction('dao-a', actor, {
        action: 'list',
        tokenId: '7',
        price: '1',
        expiresAt: String(expiry),
        paymentAsset: xlm,
        feeBps: 500
      })
    ).rejects.toThrow('locked');
    expect(mocks.client.list).not.toHaveBeenCalled();
  });
  it('secondary buys token id, not a pool id, using old fee/asset after config changes', async () => {
    const result = await prepareMarketplaceAction('dao-a', actor, {
      action: 'buy',
      kind: 'secondary',
      id: '7',
      eventId: 'cycle-one'
    });
    expect(mocks.client.buy).toHaveBeenCalledWith(
      { token_id: 7, buyer, max_price: 10000001n },
      { timeoutInSeconds: 180 }
    );
    expect(mocks.client.buy_from_pool).not.toHaveBeenCalled();
    expect(result.summary).toContain('250 bps');
    expect(mocks.readiness).toHaveBeenCalledWith(buyer, 'testnet', usdc);
  });
  it('approve then escrow are independent calls with actor identity and exact amounts', async () => {
    const action: MarketplaceAction = {
      action: 'approve',
      tokenId: '7',
      price: '1.0000001',
      expiresAt: expiry.toString(),
      paymentAsset: xlm,
      feeBps: 500
    };
    await prepareMarketplaceAction('dao-a', actor, action);
    expect(mocks.token.approve).toHaveBeenCalledWith(
      { owner: buyer, spender: PURCHASE_MARKET, token_id: 7, expiration_ledger: 1120 },
      { timeoutInSeconds: 180 }
    );
    expect(mocks.client.list).not.toHaveBeenCalled();
    await prepareMarketplaceAction('dao-a', actor, { ...action, action: 'list' });
    expect(mocks.client.list).toHaveBeenCalledWith(
      { token_id: 7, seller: buyer, price: 10000001n, expires_at: expiry, max_fee_bps: 500, payment_asset: xlm },
      { timeoutInSeconds: 180 }
    );
  });
  it('rejects stale owner and changed fee before approval or escrow', async () => {
    const action: MarketplaceAction = {
      action: 'list',
      tokenId: '7',
      price: '1',
      expiresAt: expiry.toString(),
      paymentAsset: xlm,
      feeBps: 250
    };
    await expect(prepareMarketplaceAction('dao-a', actor, action)).rejects.toThrow('fee changed');
    mocks.token.owner_of.mockResolvedValue({ result: seller });
    await expect(prepareMarketplaceAction('dao-a', actor, { ...action, feeBps: 500 })).rejects.toThrow('no longer own');
    expect(mocks.client.list).not.toHaveBeenCalled();
  });
  it('revokes only this token using the pinned NFT zero-ledger semantics, even while paused', async () => {
    const config = (await mocks.client.get_config()).result;
    mocks.client.get_config.mockResolvedValue({ result: { ...config, paused: true } });
    const result = await prepareMarketplaceAction('dao-a', actor, { action: 'revoke', tokenId: '7' });
    expect(mocks.token.approve).toHaveBeenCalledWith(
      { owner: buyer, spender: PURCHASE_MARKET, token_id: 7, expiration_ledger: 0 },
      { timeoutInSeconds: 180 }
    );
    expect(result.summary).toContain('immediately');
    expect(mocks.client.list).not.toHaveBeenCalled();
  });
  it('rejects USDC sale proceeds that cannot fit the seller trustline', async () => {
    const config = (await mocks.client.get_config()).result;
    mocks.client.get_config.mockResolvedValue({ result: { ...config, payment_asset: usdc } });
    mocks.readiness.mockResolvedValue({
      nativeAvailable: '1000000000',
      available: '0',
      authorized: true,
      trustline: true,
      receivable: '1',
      issues: [],
      assetCode: 'USDC'
    });
    await expect(
      prepareMarketplaceAction('dao-a', actor, {
        action: 'list',
        tokenId: '7',
        price: '1.0000001',
        expiresAt: expiry.toString(),
        paymentAsset: usdc,
        feeBps: 500
      })
    ).rejects.toThrow('capacity');
    expect(mocks.client.list).not.toHaveBeenCalled();
  });
  it('prepares a classic USDC trustline for the authenticated account without submitting', async () => {
    mocks.readiness.mockResolvedValue({
      nativeAvailable: '1000000000',
      available: '0',
      authorized: false,
      trustline: false,
      canAddTrustline: true,
      issues: [],
      assetCode: 'USDC'
    });
    const prepared = await prepareMarketplaceAction('dao-a', actor, { action: 'trustline', paymentAsset: usdc });
    const tx = TransactionBuilder.fromXDR(prepared.xdr, Networks.TESTNET);
    expect('source' in tx && tx.source).toBe(buyer);
    expect('operations' in tx && tx.operations[0].type).toBe('changeTrust');
    expect(prepared.summary).toContain('increases your XLM reserve');
    expect(mocks.horizonAccount).toHaveBeenCalledWith(buyer);
    expect(mocks.token.approve).not.toHaveBeenCalled();
    expect(mocks.client.buy).not.toHaveBeenCalled();
  });
  it('rejects a changed secondary cycle or amount instead of silently repricing', async () => {
    mocks.client.get_listing.mockResolvedValue({
      result: { price: 20000001n, payment_asset: usdc, expires_at: expiry, seller, fee_bps: 250 }
    });
    await expect(
      prepareMarketplaceAction('dao-a', actor, { action: 'buy', kind: 'secondary', id: '7', eventId: 'cycle-one' })
    ).rejects.toThrow('changed or closed');
    expect(mocks.client.buy).not.toHaveBeenCalled();
  });
  it.each(['pool', 'secondary'] as const)(
    'rejects old price read / replacement price simulated for %s before returning signable XDR',
    async (kind) => {
      const original = {
        ...(kind === 'pool' ? poolListing : indexed),
        price: '10000000',
        paymentAsset: xlm
      };
      mocks.listing.mockResolvedValue(original);
      mocks.client.get_listing.mockResolvedValue({
        result: { price: 10000000n, payment_asset: xlm, expires_at: expiry, seller, fee_bps: 250 }
      });
      mocks.client.get_pool.mockResolvedValue({
        result: { price: 10000000n, asset: xlm, expires_at: expiry, size: 3, closed: false, max_per_buyer: 1 }
      });
      const replacement = purchaseFixture({ ...original, price: '20000000' }, buyer, undefined, {
        pick: { page: 1, tokenId: 21 }
      });
      (kind === 'pool' ? mocks.client.buy_from_pool : mocks.client.buy).mockResolvedValue(replacement);
      await expect(
        prepareMarketplaceAction('dao-a', actor, {
          action: 'buy',
          kind,
          id: kind === 'pool' ? '4' : '7',
          eventId: 'cycle-one'
        })
      ).rejects.toMatchObject({ status: 409 });
      expect(mocks.readiness).not.toHaveBeenCalled();
    }
  );
  it('rejects closure of the selected indexed cycle during buy simulation', async () => {
    mocks.listing.mockResolvedValueOnce(indexed).mockResolvedValueOnce({ ...indexed, status: 'cancelled' });
    await expect(
      prepareMarketplaceAction('dao-a', actor, { action: 'buy', kind: 'secondary', id: '7', eventId: 'cycle-one' })
    ).rejects.toMatchObject({ status: 409 });
  });
  it('keeps the secondary cycle metadata lookup deployment/DAO/module/event scoped', async () => {
    await prepareMarketplaceAction('dao-a', actor, { action: 'buy', kind: 'secondary', id: '7', eventId: 'cycle-one' });
    expect(mocks.creation).toHaveBeenCalledWith({
      where: {
        deploymentId: 'deployment-a',
        daoId: 'dao-a',
        contractId: PURCHASE_MARKET,
        tokenId: 7n,
        eventId: 'cycle-one'
      },
      select: { createdLedger: true, createdTransactionHash: true }
    });
  });
  it('allows seller cancellation while paused', async () => {
    mocks.listing.mockResolvedValue({ ...indexed, seller: buyer });
    mocks.client.get_listing.mockResolvedValue({
      result: { price: 10000001n, payment_asset: usdc, expires_at: expiry, seller: buyer, fee_bps: 250 }
    });
    const config = (await mocks.client.get_config()).result;
    mocks.client.get_config.mockResolvedValue({ result: { ...config, paused: true } });
    await prepareMarketplaceAction('dao-a', actor, {
      action: 'cancel',
      kind: 'secondary',
      id: '7',
      eventId: 'cycle-one'
    });
    expect(mocks.client.cancel).toHaveBeenCalledWith({ token_id: 7, seller: buyer }, { timeoutInSeconds: 180 });
  });
  it('allows anyone to expire escrow after expiry, including while paused', async () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 1);
    mocks.listing.mockResolvedValue({ ...indexed, expiresAt: past.toString(), status: 'awaiting-expiry' });
    mocks.client.get_listing.mockResolvedValue({
      result: { price: 10000001n, payment_asset: usdc, expires_at: past, seller, fee_bps: 250 }
    });
    const config = (await mocks.client.get_config()).result;
    mocks.client.get_config.mockResolvedValue({ result: { ...config, paused: true } });
    const result = await prepareMarketplaceAction('dao-a', actor, {
      action: 'expire',
      kind: 'secondary',
      id: '7',
      eventId: 'cycle-one'
    });
    expect(mocks.client.expire).toHaveBeenCalledWith({ token_id: 7 }, { timeoutInSeconds: 180 });
    expect(result.summary).toContain('original seller, not the caller');
  });
  it('blocks insufficient asset funds, trustline authorization and exact native fee shortfalls', async () => {
    for (const patch of [
      { available: '10000000' },
      { authorized: false },
      { trustline: false },
      { nativeAvailable: '99' }
    ]) {
      mocks.readiness.mockResolvedValue({
        nativeAvailable: '1000000000',
        available: '1000000000',
        authorized: true,
        trustline: true,
        issues: [],
        assetCode: 'USDC',
        ...patch
      });
      await expect(
        prepareMarketplaceAction('dao-a', actor, { action: 'buy', kind: 'secondary', id: '7', eventId: 'cycle-one' })
      ).rejects.toThrow(/Insufficient|network fee/);
    }
  });
  it('never returns signable XDR for a failed simulation or unexpected second signer', () => {
    const fail = {
      get simulationData() {
        throw new Error('simulation failed');
      },
      toXdr: vi.fn()
    };
    expect(() => marketplaceTransactionXdr(fail as unknown as AssembledTransaction<void>)).toThrow('simulation failed');
    expect(fail.toXdr).not.toHaveBeenCalled();
    expect(() =>
      marketplaceTransactionXdr({
        ...transaction(),
        needsNonInvokerSigningBy: () => [seller]
      } as unknown as AssembledTransaction<void>)
    ).toThrow('another account');
  });
});
