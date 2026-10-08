/**
 * Contract <-> decoder alignment.
 *
 * Asserts the decoder's topic-name map matches the real topic order of every
 * contract event (and emitted OpenZeppelin library event). A drift here
 * silently null-fills topics and breaks every database view that reads them.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { contractEvents, findDecoderDrift } from '../src/contract-events.mjs';

test('contracts define events', () => {
  assert.ok(Object.keys(contractEvents()).length > 50);
});

test('decoder topic names match contracts and library events exactly', () => {
  assert.deepEqual(findDecoderDrift(), []);
});
