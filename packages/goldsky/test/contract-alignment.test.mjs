/**
 * Contract <-> decoder alignment.
 *
 * Asserts the decoder's topic-name map matches the real topic order of every
 * contract event (and emitted OpenZeppelin library event). A drift here
 * silently null-fills topics and breaks every database view that reads them.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { contractEventList, contractEvents, contractEventsByContract, decoderTopicNames, findDecoderDrift } from '../src/contract-events.mjs';

test('contracts define events', () => {
  assert.ok(Object.keys(contractEvents()).length > 50);
});

test('decoder topic names match contracts and library events exactly', () => {
  assert.deepEqual(findDecoderDrift(), []);
});

test('same-named events are keyed by (contract, name) and share topics', () => {
  const byContract = contractEventsByContract();
  for (const contract of ['token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata']) {
    assert.ok(byContract[`${contract}:Launched`], `${contract}:Launched missing`);
  }
  assert.deepEqual(contractEvents().Launched.contracts.sort(), ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury']);
  assert.equal(contractEventList().length, Object.keys(byContract).length);
});

test('topic orders of new and changed events', () => {
  const t = decoderTopicNames();
  assert.deepEqual(t.Execute, ['governor', 'target', 'proposal_id']);
  assert.deepEqual(t.PrimaryListingCreated, ['listing_id']);
  assert.deepEqual(t.PrimaryListingPurchased, ['listing_id', 'buyer']);
  assert.deepEqual(t.PrimaryListingCancelled, ['listing_id']);
  assert.deepEqual(t.PrimaryListingExpired, ['listing_id']);
  assert.deepEqual(t.SecondaryListingCreated, ['token_id']);
  assert.deepEqual(t.ListingPurchased, ['token_id', 'buyer']);
  assert.deepEqual(t.RefundDeferred, ['token_id', 'bidder']);
  assert.deepEqual(t.RefundWithdrawn, ['bidder']);
  assert.deepEqual(t.BidRefunded, ['token_id', 'bidder']);
  assert.deepEqual(t.AdminProposed, ['current_admin', 'proposed_admin']);
  assert.deepEqual(t.AdminChanged, ['old_admin', 'new_admin']);
  assert.deepEqual(t.PlatformMinterSet, ['minter']);
  assert.deepEqual(t.Launched, ['treasury']);
  assert.deepEqual(t.Upgraded, ['from_hash', 'to_hash']);
  assert.deepEqual(t.VersionSynced, []);
  assert.deepEqual(t.AdminProposalCancelled, ['current_admin', 'cancelled_admin']);
  assert.ok(!('MarketplaceUpgraded' in t));
  assert.deepEqual(t.MintAuthorityChanged, ['authority']);
});

test('data fields of new and changed events match events.rs', () => {
  const e = contractEventsByContract();
  assert.deepEqual(e['token:Launched'].data, ['minters']);
  assert.deepEqual(e['auction:Launched'].data, ['started']);
  assert.deepEqual(e['marketplace:Launched'].data, ['opened']);
  assert.deepEqual(e['treasury:Execute'].data, ['function', 'index']);
  assert.deepEqual(e['manager:DaoLaunched'].data, ['launched_ledger', 'modules', 'launch_auction', 'launch_marketplace', 'enable_minter']);
  for (const role of ['token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata']) {
    assert.deepEqual(e[`${role}:Upgraded`].data, ['version'], `${role}:Upgraded`);
    assert.deepEqual(e[`${role}:VersionSynced`].data, ['version'], `${role}:VersionSynced`);
  }
  assert.deepEqual(e['manager:DaoCreated'].data, ['created_ledger', 'modules', 'wasm_hashes', 'slug']);
  assert.deepEqual(e['manager:AdminProposalCancelled'].data, []);
  assert.deepEqual(e['metadata:PropertiesReset'].data, ['old_num_properties']);
  assert.deepEqual(e['auction:RefundDeferred'].data, ['amount']);
  assert.deepEqual(e['auction:RefundWithdrawn'].data, ['amount']);
  assert.deepEqual(e['marketplace:PrimaryListingCreated'].data, ['price', 'expires_at', 'payment_asset']);
  assert.deepEqual(e['marketplace:PrimaryListingPurchased'].data, ['token_id', 'price', 'payment_asset']);
  assert.deepEqual(e['marketplace:SecondaryListingCreated'].data, ['seller', 'price', 'expires_at', 'fee_bps', 'payment_asset']);
  assert.deepEqual(e['marketplace:ListingPurchased'].data, ['seller', 'price', 'fee', 'payment_asset']);
});
