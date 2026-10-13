import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectLatest,
  LEDGERS_PER_DAY,
  namespacedKeyXdr,
  nextExtendTarget,
  parseCodeTtlDays,
  positionalArg,
  SAFE_RESOURCE_FEE_STROOPS,
  scv
} from './lib.mjs';

// Code rent measured on testnet (2026-10-12): ~514 stroops per byte per day.
const RATE = 514n;
const rent = (bytes, currentDays) => (ledgers) => {
  const added = Math.max(0, ledgers / LEDGERS_PER_DAY - currentDays);
  return {
    resourceFee: BigInt(Math.round(added)) * BigInt(bytes) * RATE,
    fee: 0n
  };
};

test('a fresh large code entry is extended in steps under the fee ceiling', () => {
  const target = 170 * LEDGERS_PER_DAY;
  // 43 KB born at 7 days: the full extension (~362 XLM) is over the ceiling.
  const fresh = rent(43_180, 7);
  assert.ok(fresh(target).resourceFee > SAFE_RESOURCE_FEE_STROOPS);
  const first = nextExtendTarget(target, fresh);
  assert.ok(first.ledgers < target);
  assert.ok(first.sim.resourceFee <= SAFE_RESOURCE_FEE_STROOPS);
  // After that step the rest fits in one more.
  const second = nextExtendTarget(target, rent(43_180, first.ledgers / LEDGERS_PER_DAY));
  assert.equal(second.ledgers, target);
  assert.ok(second.sim.resourceFee <= SAFE_RESOURCE_FEE_STROOPS);
});

test('an entry that fits is extended to the full target at once', () => {
  const target = 170 * LEDGERS_PER_DAY;
  const step = nextExtendTarget(target, rent(30_000, 7));
  assert.equal(step.ledgers, target);
});

test('an extension that never fits fails instead of looping', () => {
  assert.throws(
    () =>
      nextExtendTarget(170 * LEDGERS_PER_DAY, () => ({
        resourceFee: SAFE_RESOURCE_FEE_STROOPS + 1n
      })),
    /costs/
  );
});

test('code TTL days are bounded by the contract bump and the network cap', () => {
  assert.equal(parseCodeTtlDays('170'), 170);
  assert.throws(() => parseCodeTtlDays('4'));
  assert.throws(() => parseCodeTtlDays('171'));
});

test('namespaced keys match the bytes pinned in contracts/common', () => {
  // contracts/common/src/test.rs `namespaced_key_xdr_is_pinned`.
  const hex = (b64) => Buffer.from(b64, 'base64').toString('hex');
  assert.equal(
    hex(namespacedKeyXdr('Admin')),
    '0000001000000001000000020000000f000000076275696c646572000000001000000001000000010000000f0000000541646d696e000000'
  );
  assert.equal(
    hex(namespacedKeyXdr('Listing', scv.u32(7))),
    '0000001000000001000000020000000f000000076275696c646572000000001000000001000000020000000f000000074c697374696e67000000000300000007'
  );
});

test('the artifact is found after a valueless flag and never as a flag value', () => {
  assert.equal(positionalArg(['--dry-run', 'deploys/x.json'], ['--dry-run']), 'deploys/x.json');
  assert.equal(positionalArg(['--days', '30', 'deploys/x.json', '--dry-run'], ['--dry-run']), 'deploys/x.json');
  assert.equal(positionalArg(['--identity', 'ops'], ['--dry-run']), undefined);
});

test('a revoked latest still has its pointer renewed, but not its hash', () => {
  const h = 'ab'.repeat(32);
  const view = (method, name) => {
    if (name === 'ClaimMinter') return null;
    if (method === 'latest_pointer') return { wasm_hash: h, set_ledger: 1 };
    return name === 'Token' ? { wasm_hash: h, revoked: false } : null; // Manager: revoked
  };
  const got = collectLatest(view, ['Manager', 'Token', 'ClaimMinter']);
  assert.deepEqual(got.pointerNames, ['Manager', 'Token']);
  assert.deepEqual(got.hashes, [{ hash: h, label: 'Token (latest)' }]);
});
