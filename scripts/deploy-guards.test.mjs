import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNetworkPassphrase,
  checkBuildInputs,
  confirmMainnet,
  MAINNET_MIN_UPGRADE_DELAY_LEDGERS,
  PUBLIC_NETWORK_PASSPHRASE,
  resolveIdentity,
  uncommittedBuildInputs,
  upgradeDelayFor
} from './deploy-guards.mjs';

const ADMIN = 'GADMINADDRESS';

// A fake command runner: `keys` maps identity names to addresses.
function fakeStellar(keys = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'stellar' && args[0] === 'keys' && args[1] === 'address') {
      return keys[args[2]] ? { ok: true, stdout: `${keys[args[2]]}\n`, stderr: '' } : { ok: false, stdout: '', stderr: 'not found' };
    }
    if (command === 'stellar' && args[0] === 'keys' && args[1] === 'generate') {
      keys[args[2]] = ADMIN;
      return { ok: true, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected call ${command} ${args.join(' ')}`);
  };
  return { run, calls };
}

test('mainnet refuses an upgrade notice under 7 days; other networks may shorten it', () => {
  assert.equal(MAINNET_MIN_UPGRADE_DELAY_LEDGERS, 120_960);
  assert.equal(upgradeDelayFor('mainnet', undefined), 120_960);
  assert.equal(upgradeDelayFor('mainnet', 200_000), 200_000);
  assert.throws(() => upgradeDelayFor('mainnet', 720), /below the mainnet minimum/);
  assert.throws(() => upgradeDelayFor('mainnet', 120_959), /below the mainnet minimum/);
  assert.equal(upgradeDelayFor('testnet', 720), 720);
  assert.equal(upgradeDelayFor('local', 0), 0);
  assert.throws(() => upgradeDelayFor('testnet', -1), /non-negative integer/);
  assert.throws(() => upgradeDelayFor('testnet', '1.5'), /non-negative integer/);
});

test('a mainnet config must carry the public network passphrase', () => {
  assert.doesNotThrow(() => assertNetworkPassphrase('mainnet', PUBLIC_NETWORK_PASSPHRASE));
  assert.throws(() => assertNetworkPassphrase('mainnet', 'Test SDF Network ; September 2015'), /must use the network passphrase/);
  assert.doesNotThrow(() => assertNetworkPassphrase('testnet', 'Test SDF Network ; September 2015'));
});

test('uncommitted build inputs stop a mainnet deploy and warn elsewhere', () => {
  const run = () => ({ ok: true, stdout: ' M contracts/manager/src/contract.rs\n?? releases/new.json\n', stderr: '' });
  const dirty = uncommittedBuildInputs(run);
  assert.deepEqual(dirty, [' M contracts/manager/src/contract.rs', '?? releases/new.json']);
  assert.throws(() => checkBuildInputs('mainnet', dirty), /uncommitted build inputs/);
  assert.match(checkBuildInputs('testnet', dirty), /^WARNING/);
  assert.equal(checkBuildInputs('mainnet', []), null);
  assert.throws(() => uncommittedBuildInputs(() => ({ ok: false, stdout: '', stderr: 'not a git repository' })), /can't be checked/);
});

test('a missing deploy key is an error unless --generate-identity, and never generated on mainnet', () => {
  for (const network of ['local', 'testnet']) {
    const { run, calls } = fakeStellar();
    assert.throws(() => resolveIdentity({ identityName: 'x-admin', network, adminAddress: ADMIN, generate: false }, run), /No stellar key named x-admin/);
    assert.ok(!calls.some((c) => c[2] === 'generate'), 'nothing was generated');
  }
  const mainnet = fakeStellar();
  assert.throws(
    () => resolveIdentity({ identityName: 'mainnet-admin', network: 'mainnet', adminAddress: ADMIN, generate: true }, mainnet.run),
    /never by this script/
  );
  assert.ok(!mainnet.calls.some((c) => c[2] === 'generate'), 'no key is generated on mainnet, even when asked');

  const testnet = fakeStellar();
  assert.deepEqual(
    resolveIdentity({ identityName: 'testnet-admin', network: 'testnet', adminAddress: ADMIN, generate: true }, testnet.run),
    { address: ADMIN, generated: true }
  );
});

test('the deploy key must be the config admin', () => {
  const { run } = fakeStellar({ 'testnet-admin': 'GSOMEONEELSE' });
  assert.throws(
    () => resolveIdentity({ identityName: 'testnet-admin', network: 'testnet', adminAddress: ADMIN, generate: false }, run),
    /must be the same key/
  );
  const ok = fakeStellar({ 'testnet-admin': ADMIN });
  assert.deepEqual(resolveIdentity({ identityName: 'testnet-admin', network: 'testnet', adminAddress: ADMIN, generate: false }, ok.run), {
    address: ADMIN,
    generated: false
  });
});

test('a mainnet deploy needs "mainnet <label>" typed at a terminal', async () => {
  const summary = ['MAINNET MANAGER DEPLOY'];
  const answer = (text) => async () => text;
  await assert.rejects(confirmMainnet({ label: 'builder', summary, isTTY: false, ask: answer('mainnet builder') }), /without a terminal/);
  await assert.rejects(confirmMainnet({ label: 'builder', summary, isTTY: true, ask: answer('yes') }), /cancelled/);
  await assert.rejects(confirmMainnet({ label: 'builder', summary, isTTY: true, ask: answer('mainnet dev') }), /cancelled/);
  await assert.doesNotReject(confirmMainnet({ label: 'builder', summary, isTTY: true, ask: answer(' mainnet builder\n') }));
});
