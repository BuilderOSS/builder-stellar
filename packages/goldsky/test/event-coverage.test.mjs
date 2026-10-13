/**
 * Event coverage: the structural facts about the contracts' events the pipeline
 * relies on (a launch event per module, which roles emit the common events,
 * removed events gone for good, the checked-in pipeline current). Decoder
 * completeness itself is contract-alignment.test.mjs (findDecoderDrift) and
 * every-event.test.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { contractEventList } from '../src/contract-events.mjs';
import { REMOVED_EVENTS } from './removed-events.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('every module emits its own <Module>Launched event with topic treasury', () => {
  const launched = contractEventList().filter((e) => /^[A-Z][a-z]+Launched$/.test(e.name) && e.contract !== 'manager');
  assert.deepStrictEqual(launched.map((e) => `${e.contract}:${e.name}`).sort(), [
    'auction:AuctionLaunched', 'governor:GovernorLaunched', 'marketplace:MarketplaceLaunched',
    'metadata:MetadataLaunched', 'token:TokenLaunched', 'treasury:TreasuryLaunched'
  ]);
  for (const e of launched) assert.deepStrictEqual(e.topics, ['treasury'], `${e.contract}.${e.name} topics`);
  const dataByContract = Object.fromEntries(launched.map((e) => [e.contract, e.data]));
  assert.deepStrictEqual(dataByContract.token, ['grants']);
  assert.deepStrictEqual(dataByContract.auction, ['started']);
  assert.deepStrictEqual(dataByContract.marketplace, ['opened']);
  for (const c of ['governor', 'treasury', 'metadata']) assert.deepStrictEqual(dataByContract[c], []);
});

test('Upgraded, Migrated and AdminChanged come from contracts/common and are listed once per emitting module', () => {
  const roles = ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury'];
  // The shared Minter upgrades and migrates through contracts/common as well.
  for (const name of ['Upgraded', 'Migrated']) {
    const found = contractEventList().filter((e) => e.name === name);
    assert.deepStrictEqual(found.map((e) => e.contract).sort(), [...roles, 'minter'].sort(), name);
    for (const e of found) assert.strictEqual(e.source, 'common');
  }
  const upgraded = contractEventList().find((e) => e.name === 'Upgraded');
  assert.deepStrictEqual(upgraded.topics, ['from_hash', 'to_hash']);
  assert.deepStrictEqual(upgraded.data, ['version']);
  assert.ok(!contractEventList().some((e) => e.name === 'VersionSynced'));
  const migrated = contractEventList().find((e) => e.name === 'Migrated');
  assert.deepStrictEqual(migrated.data, ['from_storage_version', 'to_storage_version']);
  // AdminChanged: once per module from common, plus the Manager's own, with one shape.
  const admin = contractEventList().filter((e) => e.name === 'AdminChanged');
  assert.deepStrictEqual(admin.map((e) => e.contract).sort(), ['manager', ...roles].sort());
  for (const e of admin) assert.deepStrictEqual(e.topics, ['old_admin', 'new_admin'], `${e.contract}.AdminChanged`);
});

test('UpgradeDelayChanged comes from contracts/common and is listed for the Manager and the Minter only', () => {
  const found = contractEventList().filter((e) => e.name === 'UpgradeDelayChanged');
  assert.deepStrictEqual(found.map((e) => e.contract).sort(), ['manager', 'minter']);
  for (const e of found) {
    assert.strictEqual(e.source, 'common');
    assert.deepStrictEqual(e.topics, []);
    assert.deepStrictEqual(e.data, ['from_ledgers', 'to_ledgers', 'effective_ledger']);
  }
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
