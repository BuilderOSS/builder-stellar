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
  // AdminChanged: the Manager's own handover and every module's launch handoff.
  for (const contract of ['manager', 'token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata']) {
    assert.ok(byContract[`${contract}:AdminChanged`], `${contract}:AdminChanged missing`);
  }
  assert.deepEqual(contractEvents().AdminChanged.contracts.sort(), ['auction', 'governor', 'manager', 'marketplace', 'metadata', 'token', 'treasury']);
  assert.ok(!('Launched' in contractEvents()), 'the shared Launched name is gone');
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
  for (const name of ['TokenLaunched', 'GovernorLaunched', 'TreasuryLaunched', 'AuctionLaunched', 'MarketplaceLaunched', 'MetadataLaunched']) {
    assert.deepEqual(t[name], ['treasury'], name);
  }
  assert.deepEqual(t.Upgraded, ['from_hash', 'to_hash']);
  assert.deepEqual(t.VersionSynced, []);
  assert.deepEqual(t.Migrated, []);
  assert.deepEqual(t.ProposalScheduled, ['proposal_id']);
  assert.deepEqual(t.MintBatchWithMinter, ['minter']);
  assert.deepEqual(t.SeedsGenerated, ['first_token_id']);
  assert.deepEqual(t.SlugClaimed, ['token_address', 'slug']);
  assert.deepEqual(t.PendingSlugUpdated, ['token_address']);
  assert.deepEqual(t.LatestImplementationSet, ['name', 'wasm_hash']);
  assert.deepEqual(t.QuorumBpsChanged, ['changed_by']);
  assert.deepEqual(t.MarketplacePaused, ['changed_by']);
  assert.deepEqual(t.MarketplaceInitialized, ['token', 'admin']);
  assert.ok(!('OwnershipTransfer' in t));
  assert.deepEqual(t.AdminProposalCancelled, ['current_admin', 'cancelled_admin']);
  assert.ok(!('MarketplaceUpgraded' in t));
  assert.deepEqual(t.MintAuthorityChanged, ['authority']);
});

test('data fields of new and changed events match events.rs', () => {
  const e = contractEventsByContract();
  assert.deepEqual(e['token:TokenLaunched'].data, ['minters']);
  assert.deepEqual(e['auction:AuctionLaunched'].data, ['started']);
  assert.deepEqual(e['marketplace:MarketplaceLaunched'].data, ['opened']);
  assert.deepEqual(e['governor:ProposalScheduled'].data, ['vote_start', 'vote_end', 'snapshot_ledger', 'quorum_votes']);
  assert.deepEqual(e['manager:PendingSlugUpdated'].data, ['slug']);
  assert.deepEqual(e['manager:SlugClaimed'].data, []);
  assert.deepEqual(e['manager:ImplementationRegistered'].data, ['name', 'version', 'published_ledger']);
  assert.deepEqual(e['marketplace:SecondaryFeeUpdated'].data, ['fee_bps']);
  assert.deepEqual(e['treasury:Execute'].data, ['function', 'index']);
  assert.deepEqual(e['manager:DaoLaunched'].data, ['launched_ledger', 'modules', 'launch_auction', 'launch_marketplace', 'enable_minter']);
  for (const role of ['token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata']) {
    assert.deepEqual(e[`${role}:Upgraded`].data, ['version'], `${role}:Upgraded`);
    assert.deepEqual(e[`${role}:VersionSynced`].data, ['version'], `${role}:VersionSynced`);
    assert.deepEqual(e[`${role}:Migrated`].data, ['from_storage_version', 'to_storage_version'], `${role}:Migrated`);
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
