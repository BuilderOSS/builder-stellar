/**
 * Contract <-> decoder alignment.
 *
 * Asserts the decoder's topic-name map matches the real topic order of every
 * contract event (and emitted OpenZeppelin library event). A drift here
 * silently null-fills topics and breaks every database view that reads them.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contractEventList, contractEvents, contractEventsByContract, decoderTopicNames, findDecoderDrift, repoRoot } from '../src/contract-events.mjs';

test('every #[contractevent] lives in a file the alignment parser reads', () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'target' ? [] : walk(p);
    return p.endsWith('.rs') ? [p] : [];
  });
  const files = walk(join(repoRoot, 'contracts'))
    .filter((f) => /^#\[contractevent/m.test(readFileSync(f, 'utf8')))
    .map((f) => relative(repoRoot, f));
  const unparsed = files.filter((f) => !/^contracts\/[^/]+\/src\/events\.rs$/.test(f) && !/^contracts\/common\/src\/[^/]+\.rs$/.test(f));
  assert.deepEqual(unparsed, [], 'move the event to events.rs or teach contractEventList() about the file');
});

test('contracts define events', () => {
  assert.ok(Object.keys(contractEvents()).length > 50);
});

test('decoder topic names match contracts and library events exactly', () => {
  assert.deepEqual(findDecoderDrift(), []);
});

test('same-named events are keyed by (contract, name) and share topics', () => {
  const byContract = contractEventsByContract();
  // AdminChanged: the Manager's own handover and every module's launch handoff.
  for (const contract of ['manager', 'token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata', 'claims']) {
    assert.ok(byContract[`${contract}:AdminChanged`], `${contract}:AdminChanged missing`);
  }
  assert.deepEqual(contractEvents().AdminChanged.contracts.sort(), ['auction', 'claims', 'governor', 'manager', 'marketplace', 'metadata', 'token', 'treasury']);
  // The minter crate is the ClaimMinter: its events carry the registry kind as their role.
  assert.ok(byContract['claims:Claimed'] && !contractEventList().some((e) => e.contract === 'minter'));
  assert.ok(!('Launched' in contractEvents()), 'the shared Launched name is gone');
  assert.equal(contractEventList().length, Object.keys(byContract).length);
});

test('topic orders of new and changed events', () => {
  const t = decoderTopicNames();
  assert.deepEqual(t.Execute, ['governor', 'target', 'proposal_id']);
  for (const name of ['PrimaryListingCreated', 'PrimaryListingPurchased', 'PlatformMinterSet', 'MerkleRootSetEvent', 'MerkleClaimEvent']) {
    assert.ok(!(name in t), `${name} is retired`);
  }
  assert.deepEqual(t.PoolOpened, ['pool_id']);
  assert.deepEqual(t.PoolPurchased, ['pool_id', 'buyer']);
  assert.deepEqual(t.ListOpened, ['list_id']);
  assert.deepEqual(t.Claimed, ['list_id', 'claimer']);
  assert.deepEqual(t.Refunded, ['list_id', 'claimer']);
  assert.deepEqual(t.ModuleCreated, ['token_address', 'kind']);
  assert.deepEqual(t.AssuranceOpened, ['token_address']);
  assert.deepEqual(t.SlugReleased, ['token_address', 'slug']);
  assert.deepEqual(t.TransferAgentChanged, ['module']);
  assert.deepEqual(t.AgentTransfer, ['agent']);
  assert.deepEqual(t.DaoTransfer, ['from', 'to']);
  assert.deepEqual(t.TransfersLockChanged, []);
  assert.deepEqual(t.SecondaryListingCreated, ['token_id']);
  assert.deepEqual(t.ListingPurchased, ['token_id', 'buyer']);
  assert.deepEqual(t.RefundDeferred, ['token_id', 'bidder']);
  assert.deepEqual(t.RefundWithdrawn, ['bidder']);
  assert.deepEqual(t.BidRefunded, ['token_id', 'bidder']);
  assert.deepEqual(t.AdminProposed, ['current_admin', 'proposed_admin']);
  assert.deepEqual(t.AdminChanged, ['old_admin', 'new_admin']);
  for (const name of ['TokenLaunched', 'GovernorLaunched', 'TreasuryLaunched', 'AuctionLaunched', 'MarketplaceLaunched', 'MetadataLaunched', 'ClaimMinterLaunched']) {
    assert.deepEqual(t[name], ['treasury'], name);
  }
  assert.deepEqual(t.Upgraded, ['from_hash', 'to_hash']);
  assert.ok(!('VersionSynced' in t));
  assert.deepEqual(t.ProfileUpdated, ['seq']);
  assert.ok(!('AllowlistSetEvent' in t));
  assert.deepEqual(t.Migrated, []);
  assert.deepEqual(t.ProposalScheduled, ['proposal_id']);
  assert.deepEqual(t.MintBatchWithMinter, ['minter']);
  assert.deepEqual(t.SeedsGenerated, ['first_token_id']);
  assert.deepEqual(t.SlugClaimed, ['token_address', 'slug']);
  assert.deepEqual(t.SlugChanged, ['token_address', 'new_slug']);
  assert.deepEqual(t.PendingSlugUpdated, ['token_address']);
  assert.deepEqual(t.LatestImplementationSet, ['name', 'wasm_hash']);
  assert.deepEqual(t.QuorumBpsChanged, ['changed_by']);
  assert.deepEqual(t.MarketplacePaused, ['changed_by']);
  assert.deepEqual(t.MarketplaceInitialized, ['token', 'admin']);
  assert.ok(!('OwnershipTransfer' in t));
  assert.deepEqual(t.AdminProposalCancelled, ['current_admin', 'cancelled_admin']);
  assert.ok(!('MarketplaceUpgraded' in t));
  assert.ok(!('MintAuthorityChanged' in t));
  assert.deepEqual(t.MintAllowanceChanged, ['module']);
  assert.deepEqual(t.ModuleRegistered, ['kind']);
  assert.deepEqual(t.ModuleUnregistered, ['kind']);
});

test('data fields of new and changed events match events.rs', () => {
  const e = contractEventsByContract();
  assert.deepEqual(e['token:TokenLaunched'].data, ['grants']);
  assert.deepEqual(e['token:MintAllowanceChanged'].data, ['old_allowance', 'allowance', 'changed_by']);
  assert.deepEqual(e['token:ModuleRegistered'].data, ['address', 'non_voting']);
  assert.deepEqual(e['token:ModuleUnregistered'].data, ['address']);
  assert.deepEqual(e['auction:AuctionLaunched'].data, ['started']);
  assert.deepEqual(e['marketplace:MarketplaceLaunched'].data, ['opened']);
  assert.deepEqual(e['governor:ProposalScheduled'].data, ['vote_start', 'vote_end', 'snapshot_ledger', 'quorum_votes']);
  assert.deepEqual(e['manager:PendingSlugUpdated'].data, ['slug']);
  assert.deepEqual(e['manager:SlugClaimed'].data, []);
  assert.deepEqual(e['manager:ImplementationRegistered'].data, ['name', 'version', 'published_ledger']);
  assert.deepEqual(e['marketplace:SecondaryFeeUpdated'].data, ['fee_bps']);
  assert.deepEqual(e['treasury:Execute'].data, ['function', 'index']);
  assert.deepEqual(e['manager:DaoLaunched'].data, ['launched_ledger', 'modules', 'launch_auction', 'launch_marketplace', 'registry']);
  assert.deepEqual(e['manager:AssuranceOpened'].data, ['claim_minter', 'list_id', 'deadline', 'launch_auction', 'launch_marketplace']);
  assert.deepEqual(e['manager:ModuleCreated'].data, ['n', 'address']);
  assert.deepEqual(e['token:TokenInitialized'].data, ['name', 'symbol', 'settings']);
  assert.deepEqual(e['token:TransfersLockChanged'].data, ['locked', 'changed_by']);
  assert.deepEqual(e['token:DaoTransfer'].data, ['token_id', 'changed_by']);
  assert.deepEqual(e['token:AgentTransfer'].data, ['from', 'to', 'token_id']);
  assert.deepEqual(e['claims:ListOpened'].data, ['root', 'tree_uri', 'asset', 'price', 'expires_at', 'total', 'assurance']);
  assert.deepEqual(e['claims:Claimed'].data, ['amount', 'first_token_id', 'paid', 'escrowed', 'claimed']);
  assert.deepEqual(e['marketplace:PoolOpened'].data, ['price', 'asset', 'expires_at', 'size', 'max_per_buyer', 'max_sold_per_period', 'period_secs']);
  assert.deepEqual(e['marketplace:PoolPurchased'].data, ['token_id', 'price', 'asset']);
  assert.deepEqual(e['metadata:ProfileUpdated'].data, ['hash', 'profile']);
  assert.deepEqual(e['metadata:MetadataInitialized'].data, ['renderer_base', 'admin']);
  for (const role of ['token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata', 'claims']) {
    assert.deepEqual(e[`${role}:Upgraded`].data, ['version'], `${role}:Upgraded`);
    assert.ok(!e[`${role}:VersionSynced`], `${role}:VersionSynced`);
    assert.deepEqual(e[`${role}:Migrated`].data, ['from_storage_version', 'to_storage_version'], `${role}:Migrated`);
  }
  assert.deepEqual(e['manager:DaoCreated'].data, ['created_ledger', 'modules', 'wasm_hashes', 'slug']);
  assert.deepEqual(e['manager:AdminProposalCancelled'].data, []);
  assert.deepEqual(e['metadata:PropertiesReset'].data, ['old_num_properties']);
  assert.deepEqual(e['auction:RefundDeferred'].data, ['amount']);
  assert.deepEqual(e['auction:RefundWithdrawn'].data, ['amount']);
  assert.deepEqual(e['marketplace:SecondaryListingCreated'].data, ['seller', 'price', 'expires_at', 'fee_bps', 'payment_asset']);
  assert.deepEqual(e['marketplace:ListingPurchased'].data, ['seller', 'price', 'fee', 'payment_asset']);
});
