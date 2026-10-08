/**
 * Event Coverage Tests
 *
 * Validates that all DAO-specific contract events are handled by the Goldsky decoder.
 * This focuses on custom events emitted by our contracts, not library events.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { contractEventList, LIBRARY_EVENTS } from '../src/contract-events.mjs';
import { REMOVED_EVENTS } from './removed-events.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core DAO events that must be handled
// Extracted from our contract Rust source and generated bindings
const REQUIRED_EVENTS = {
  minter: ['MerkleClaimEvent', 'AllowlistClaimEvent', 'MintBatchEvent', 'MerkleRootSetEvent', 'AllowlistSetEvent'],
  token: [
    'TokenInitialized',
    'Mint',
    'MintWithMinter',
    'MintAuthorityChanged',
    'Transfer',
    'Approve',
    'DelegateChanged',
    'DelegateVotesChanged',
    'Launched',
    'Upgraded',
    'VersionSynced'
  ],
  governor: [
    'GovernorInitialized',
    'ProposalCreated',
    'ProposalQueued',
    'VoteCast',
    'ProposalCancelled',
    'ProposalExecuted',
    'QueueDelayChanged',
    'VotingDelayChanged',
    'VotingPeriodChanged',
    'ProposalThresholdChanged',
    'QuorumBpsChanged',
    'Launched',
    'Upgraded',
    'VersionSynced'
  ],
  treasury: [
    'TreasuryInitialized',
    'Launched',
    'Execute',
    'Upgraded',
    'VersionSynced'
  ],
  auction: [
    'AuctionInitialized',
    'AuctionCreated',
    'BidPlaced',
    'AuctionSettled',
    'DurationUpdated',
    'ReservePriceUpdated',
    'MinBidIncrementUpdated',
    'TimeBufferUpdated',
    'PaymentTokenUpdated',
    'BidRefunded',
    'RefundDeferred',
    'RefundWithdrawn',
    'Launched',
    'AuctionCancelled',
    'Upgraded',
    'VersionSynced'
  ],
  metadata: [
    'MetadataInitialized',
    'PropertyAdded',
    'PropertiesReset',
    'ProjectURIUpdated',
    'DescriptionUpdated',
    'RendererBaseUpdated',
    'ContractImageUpdated',
    'SeedGenerated',
    'Launched',
    'Upgraded',
    'VersionSynced'
  ],
  marketplace: [
    'MarketplaceInitialized',
    'Launched',
    'PrimaryListingCreated',
    'PrimaryListingPurchased',
    'PrimaryListingCancelled',
    'PrimaryListingExpired',
    'SecondaryListingCreated',
    'ListingPurchased',
    'ListingCancelled',
    'ListingExpired',
    'PaymentAssetUpdated',
    'SecondaryFeeUpdated',
    'MarketplacePaused',
    'MarketplaceUnpaused',
    'Upgraded',
    'VersionSynced'
  ],
  manager: [
    'ManagerInitialized',
    'DaoCreated',
    'DaoLaunched',
    'ImplementationRegistered',
    'UpgradeApproved',
    'ImplementationRevoked',
    'CurrentImplementationsUpdated',
    'ManagerUpgraded',
    'FactoryPaused',
    'FactoryUnpaused',
    'AdminProposed',
    'AdminChanged',
    'AdminProposalCancelled',
    'PlatformMinterSet'
  ]
};

/**
 * Extract handled event names from decoder
 */
function getHandledEvents() {
  const decoderPath = join(__dirname, '../src/decoded-events.script.js');
  const content = readFileSync(decoderPath, 'utf8');

  const eventNameRegex = /eventName === ['"](\w+)['"]/g;
  const matches = [...content.matchAll(eventNameRegex)];
  const topicNames = [...content.matchAll(/\b([A-Z][A-Za-z0-9]*)\s*:/g)];
  topicNames.forEach(match => matches.push([match[0], match[1]]));

  const eventNames = new Set();
  matches.forEach(match => {
    const name = match[1];
    // Keep both snake_case and PascalCase versions
    eventNames.add(name);
    // Also add normalized PascalCase version
    const normalized = name.charAt(0).toUpperCase() + name.slice(1).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    eventNames.add(normalized);
  });

  return eventNames;
}

test('decoder handles all required minter events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.minter.filter(event => !handled.has(event));
  assert.strictEqual(missing.length, 0, `Missing minter events: ${missing.join(', ')}`);
});

test('decoder handles all required token events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.token.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing token events: ${missing.join(', ')}`
  );
});

test('decoder handles all required governor events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.governor.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing governor events: ${missing.join(', ')}`
  );
});

test('decoder handles all required treasury events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.treasury.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing treasury events: ${missing.join(', ')}`
  );
});

test('decoder handles all required auction events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.auction.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing auction events: ${missing.join(', ')}`
  );
});

test('decoder handles all required metadata events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.metadata.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing metadata events: ${missing.join(', ')}`
  );
});

test('decoder handles all required marketplace events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.marketplace.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing marketplace events: ${missing.join(', ')}`
  );
});

test('decoder handles all required manager events', () => {
  const handled = getHandledEvents();
  const missing = REQUIRED_EVENTS.manager.filter(event => !handled.has(event));

  assert.strictEqual(
    missing.length,
    0,
    `Missing manager events: ${missing.join(', ')}`
  );
});

test('all required DAO events are covered', () => {
  const handled = getHandledEvents();
  const allRequired = [
    ...REQUIRED_EVENTS.minter,
    ...REQUIRED_EVENTS.token,
    ...REQUIRED_EVENTS.governor,
    ...REQUIRED_EVENTS.treasury,
    ...REQUIRED_EVENTS.auction,
    ...REQUIRED_EVENTS.metadata,
    ...REQUIRED_EVENTS.marketplace,
    ...REQUIRED_EVENTS.manager
  ];

  const missing = allRequired.filter(event => !handled.has(event));
  const total = allRequired.length;
  const covered = total - missing.length;
  const percentage = Math.round((covered / total) * 100);

  console.log(`\n📊 DAO Event Coverage: ${covered}/${total} (${percentage}%)\n`);

  assert.strictEqual(
    missing.length,
    0,
    `Missing ${missing.length} DAO events: ${missing.join(', ')}`
  );
});

test('REQUIRED_EVENTS matches contracts/*/src/events.rs exactly, per contract', () => {
  const actual = {};
  for (const { contract, name } of contractEventList()) (actual[contract] ??= []).push(name);
  for (const contract of Object.keys(actual)) {
    const required = REQUIRED_EVENTS[contract] ?? [];
    // REQUIRED_EVENTS may also list OpenZeppelin library events the module publishes.
    const contractOnly = required.filter((name) => !(name in LIBRARY_EVENTS) || actual[contract].includes(name));
    assert.deepStrictEqual([...actual[contract]].sort(), [...contractOnly].sort(), `${contract} events drifted from REQUIRED_EVENTS`);
  }
  assert.deepStrictEqual(Object.keys(REQUIRED_EVENTS).sort(), Object.keys(actual).sort());
});

test('every module emits a Launched event (six structs share one name)', () => {
  const launched = contractEventList().filter((e) => e.name === 'Launched');
  assert.deepStrictEqual(launched.map((e) => e.contract).sort(), ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury']);
  for (const e of launched) assert.deepStrictEqual(e.topics, ['treasury'], `${e.contract}.Launched topics`);
  const dataByContract = Object.fromEntries(launched.map((e) => [e.contract, e.data]));
  assert.deepStrictEqual(dataByContract.token, ['minters']);
  assert.deepStrictEqual(dataByContract.auction, ['started']);
  assert.deepStrictEqual(dataByContract.marketplace, ['opened']);
  for (const c of ['governor', 'treasury', 'metadata']) assert.deepStrictEqual(dataByContract[c], []);
});

test('Upgraded and VersionSynced come from contracts/common and are listed once per emitting module', () => {
  const roles = ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury'];
  for (const name of ['Upgraded', 'VersionSynced']) {
    const found = contractEventList().filter((e) => e.name === name);
    assert.deepStrictEqual(found.map((e) => e.contract).sort(), roles, name);
    for (const e of found) assert.strictEqual(e.source, 'common');
  }
  const upgraded = contractEventList().find((e) => e.name === 'Upgraded');
  assert.deepStrictEqual(upgraded.topics, ['from_hash', 'to_hash']);
  assert.deepStrictEqual(upgraded.data, ['version']);
  const synced = contractEventList().find((e) => e.name === 'VersionSynced');
  assert.deepStrictEqual(synced.topics, []);
  assert.deepStrictEqual(synced.data, ['version']);
});

test('removed events are neither emitted by any contract nor decoded', () => {
  const emitted = new Set(contractEventList().map((e) => e.name));
  const decoderSource = readFileSync(join(__dirname, '../src/decoded-events.script.js'), 'utf8');
  const activitySource = readFileSync(join(__dirname, '../src/activity-feed.script.js'), 'utf8');
  for (const name of REMOVED_EVENTS) {
    assert.ok(!emitted.has(name), `${name} is emitted by a contract again`);
    assert.ok(!new RegExp(`\\b${name}\\b`).test(decoderSource), `${name} still in decoder`);
    assert.ok(!new RegExp(`\\b${name}\\b`).test(activitySource), `${name} still in activity feed`);
  }
});

test('checked-in pipeline embeds the current decoder and activity scripts (regenerate after edits)', () => {
  const yaml = readFileSync(join(__dirname, '../pipelines/builder-stellar-events.yaml'), 'utf8');
  for (const file of ['raw-events.script.js', 'decoded-events.script.js', 'activity-feed.script.js']) {
    const script = readFileSync(join(__dirname, '../src', file), 'utf8').trimEnd().split(/\r?\n/)
      .map((line) => (line.trim() === '' ? '' : `      ${line}`)).join('\n');
    assert.ok(yaml.includes(script), `pipelines/builder-stellar-events.yaml is stale for ${file}: run pnpm generate`);
  }
});
