import { Asset, Networks, rpc } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  creationEvent,
  creationHistory,
  currentListingEntry,
  PURCHASE_MARKET,
  PURCHASE_SELLER,
  purchaseFixture,
  purchaseFixtureClient,
  secondaryEntry
} from './purchase-authorization.fixtures';
import { assertSecondaryPurchaseCycle } from './purchase-cycle';
import type { MarketplaceListing } from './types';

const listing: MarketplaceListing = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  contractId: PURCHASE_MARKET,
  eventId: 'original-cycle',
  kind: 'secondary',
  id: '7',
  tokenId: '7',
  price: '1',
  paymentAsset: Asset.native().contractId(Networks.TESTNET),
  feeBps: 250,
  seller: PURCHASE_SELLER,
  buyer: null,
  expiresAt: '2000000000',
  status: 'open',
  createdAt: null,
  closedAt: null,
  transactionHash: 'creation-hash'
};
const creation = { createdLedger: 900n, createdTransactionHash: listing.transactionHash };
function server() {
  return {
    getEvents: vi.fn().mockResolvedValue(creationHistory(listing)),
    getLedgerEntries: vi.fn().mockResolvedValue(currentListingEntry(listing))
  };
}
function check(simulation = purchaseFixture(listing).simulation, rpcServer = server()) {
  return assertSecondaryPurchaseCycle(listing, creation, simulation, purchaseFixtureClient, rpcServer);
}

describe('secondary listing cycle proof (real-XDR state and events)', () => {
  it('accepts the exact reviewed creation and current unchanged entry', async () => {
    const rpcServer = server();
    await expect(check(purchaseFixture(listing).simulation, rpcServer)).resolves.toBeUndefined();
    expect(rpcServer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 900,
        endLedger: 901,
        filters: [expect.objectContaining({ contractIds: [PURCHASE_MARKET] })]
      })
    );
  });
  it('rejects an identical-term replacement created in a different ledger', async () => {
    const original = purchaseFixture(listing).simulation;
    await expect(
      check({ ...original, stateChanges: [{ ...original.stateChanges![0], before: secondaryEntry(listing, 901) }] })
    ).rejects.toThrow('reviewed listing');
  });
  it('rejects a replacement with identical spends but a different fee or expiry', async () => {
    // At price=1 stroop both fee rates round to zero; authorization amounts alone cannot detect this.
    for (const change of [{ feeBps: 251 }, { expiresAt: '2000000001' }]) {
      await expect(check(purchaseFixture({ ...listing, ...change }).simulation)).rejects.toThrow('reviewed listing');
    }
  });
  it('rejects same-ledger replacements and multiple creates even within one transaction hash', async () => {
    const rpcServer = server();
    const original = creationEvent(listing);
    rpcServer.getEvents.mockResolvedValue({
      ...creationHistory(listing),
      events: [original, { ...original, id: 'replacement-event' }]
    });
    await expect(check(purchaseFixture(listing).simulation, rpcServer)).rejects.toThrow('reviewed listing');
    rpcServer.getEvents.mockResolvedValue({
      ...creationHistory(listing),
      events: [{ ...original, txHash: 'replacement-hash' }]
    });
    await expect(check(purchaseFixture(listing).simulation, rpcServer)).rejects.toThrow('reviewed listing');
  });
  it('rejects replacement or removal after simulation instead of returning a stale quote', async () => {
    const rpcServer = server();
    rpcServer.getLedgerEntries.mockResolvedValue({
      ...currentListingEntry(listing),
      entries: [{ ...currentListingEntry(listing).entries[0], lastModifiedLedgerSeq: 1001 }],
      latestLedger: 1001
    });
    await expect(check(purchaseFixture(listing).simulation, rpcServer)).rejects.toThrow('reviewed listing');
    rpcServer.getLedgerEntries.mockResolvedValue({ latestLedger: 1001, entries: [] });
    await expect(check(purchaseFixture(listing).simulation, rpcServer)).rejects.toThrow('reviewed listing');
  });
  it('fails closed on missing state differences, absent creation evidence, or retention gaps', async () => {
    const original = purchaseFixture(listing).simulation;
    await expect(check({ ...original, stateChanges: undefined })).rejects.toThrow('reviewed listing');
    await expect(check({ ...original, stateChanges: [] })).rejects.toThrow('reviewed listing');
    const rpcServer = server();
    rpcServer.getEvents.mockResolvedValue({ ...creationHistory(listing), events: [] });
    await expect(check(original, rpcServer)).rejects.toThrow('reviewed listing');
    rpcServer.getEvents.mockResolvedValue({ ...creationHistory(listing), oldestLedger: 901 });
    await expect(check(original, rpcServer)).rejects.toThrow('reviewed listing');
    rpcServer.getEvents.mockRejectedValue(new Error('history no longer retained'));
    await expect(check(original, rpcServer)).rejects.toThrow('retained chain evidence');
  });
  it('rejects stale RPC evidence and non-deletion state changes', async () => {
    const original = purchaseFixture(listing).simulation;
    const rpcServer = server();
    rpcServer.getLedgerEntries.mockResolvedValue({ ...currentListingEntry(listing), latestLedger: 999 });
    await expect(check(original, rpcServer)).rejects.toThrow('reviewed listing');
    await expect(
      check({ ...original, stateChanges: [{ ...original.stateChanges![0], after: secondaryEntry(listing) }] })
    ).rejects.toThrow('reviewed listing');
    await expect(
      assertSecondaryPurchaseCycle(
        listing,
        creation,
        { ...original, error: 'bad' } as rpc.Api.SimulateTransactionResponse,
        purchaseFixtureClient,
        server()
      )
    ).rejects.toThrow();
  });
});
