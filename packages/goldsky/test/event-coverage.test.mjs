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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core DAO events that must be handled
// Extracted from our contract Rust source and generated bindings
const REQUIRED_EVENTS = {
  token: [
    'TokenInitialized',
    'Mint',
    'MintWithMinter',
    'BatchMint',
    'MintAuthorityChanged',
    'Transfer',
    'Approve',
    'DelegateChanged',
    'DelegateVotesChanged'
  ],
  governor: [
    'GovernorInitialized',
    'ProposalCreated',
    'ProposalQueued',
    'VoteCast',
    'ProposalCanceled', // Note: bindings use 'Cancelled' but events emit 'Canceled'
    'ProposalCancelled',
    'ProposalExecuted',
    'ProposalExpired',
    'TreasuryChanged',
    'TokenContractChanged',
    'QueueDelayChanged',
    'VotingDelayChanged',
    'VotingPeriodChanged',
    'ProposalThresholdChanged',
    'QuorumBpsChanged',
    'GovernorAuthorityChanged'
  ],
  treasury: [
    'TreasuryInitialized',
    'GovernorChanged',
    'Execute'
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
    'TreasuryUpdated',
    'BidRefunded',
    'AuctionCancelled'
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

test('all required DAO events are covered', () => {
  const handled = getHandledEvents();
  const allRequired = [
    ...REQUIRED_EVENTS.token,
    ...REQUIRED_EVENTS.governor,
    ...REQUIRED_EVENTS.treasury,
    ...REQUIRED_EVENTS.auction
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
