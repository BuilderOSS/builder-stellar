import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEDGERS_PER_DAY,
  namespacedKeyXdr,
  nextExtendTarget,
  parseCodeTtlDays,
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
