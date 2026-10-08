import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keccak256, keccakSelfTest, descriptionHash, encodeAddressVec, encodeSymbolVec, encodeActions, val,
  paramArgs, invokeArgv, parseCliValue, normalizeState, errorCode, txHashFrom, redact, selectPhases, assertBytes32
} from './e2e-testnet.mjs';

const G1 = 'GDQB6R74Q5K4MOCKPB3NLB7SX4BQR7DTXA3BGNKIVMZEXBEKCK4NQPFU';
const C1 = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

test('keccak256 matches known vectors (legacy padding, not sha3)', () => {
  keccakSelfTest();
  assert.equal(descriptionHash(''), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(keccak256(Buffer.from('abc')), '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  // multi-block input (> 136 bytes) stays 32 bytes of hex
  assert.match(keccak256(Buffer.alloc(300, 7)), /^[0-9a-f]{64}$/);
});

test('Vec<Address> and Vec<Symbol> encodings', () => {
  assert.equal(encodeAddressVec([G1, C1]), `["${G1}","${C1}"]`);
  assert.throws(() => encodeAddressVec(['nope']));
  assert.equal(encodeSymbolVec(['set_quorum_bps', 'create_primary_listing']), '["set_quorum_bps","create_primary_listing"]');
  assert.throws(() => encodeSymbolVec(['bad name']));
  assert.throws(() => encodeSymbolVec(['x'.repeat(33)]));
});

test('nested Vec<Vec<Val>> for set_quorum_bps(u32) + create_primary_listing(i128,u64)', () => {
  const enc = encodeActions([
    { target: C1, fn: 'set_quorum_bps', args: [val.u32(2000)] },
    { target: G1, fn: 'create_primary_listing', args: [val.i128(10000000n), val.u64(1900000000)] }
  ]);
  assert.equal(enc.targets, `["${C1}","${G1}"]`);
  assert.equal(enc.functions, '["set_quorum_bps","create_primary_listing"]');
  assert.equal(enc.args, '[[{"u32":2000}],[{"i128":"10000000"},{"u64":"1900000000"}]]');
  assert.deepEqual(JSON.parse(enc.args), [[{ u32: 2000 }], [{ i128: '10000000' }, { u64: '1900000000' }]]);
  assert.throws(() => encodeActions([]));
});

test('argv construction mirrors deploy-dao.mjs (strings verbatim, scalars stringified, objects JSON)', () => {
  assert.deepEqual(paramArgs({ a: 'x y', b: 1, c: 10n, d: true, e: [1] }), ['--a', 'x y', '--b', '1', '--c', '10', '--d', 'true', '--e', '[1]']);
  const argv = invokeArgv({ id: C1, source: 'alice', send: 'no', method: 'is_live' });
  assert.deepEqual(argv, ['contract', 'invoke', '--id', C1, '--source-account', 'alice', '--network', 'testnet', '--send', 'no', '--', 'is_live']);
  assert.ok(!invokeArgv({ id: C1, source: 'alice', method: 'x' }).includes('--send'));
  assert.equal(assertBytes32('a'.repeat(64)), 'a'.repeat(64));
  assert.throws(() => assertBytes32('A'.repeat(64)));
});

test('CLI output parsing helpers', () => {
  assert.equal(parseCliValue('true\n'), true);
  assert.equal(parseCliValue('"10000000"\n'), '10000000');
  assert.equal(parseCliValue('null'), null);
  assert.deepEqual(parseCliValue('{"a":1}'), { a: 1 });
  assert.equal(parseCliValue('log line\n"abc"'), 'abc');
  assert.equal(normalizeState(1), 'Active');
  assert.equal(normalizeState('7'), 'Executed');
  assert.equal(normalizeState('Queued'), 'Queued');
  assert.equal(normalizeState(['Succeeded']), 'Succeeded');
  assert.equal(errorCode('error: ... Error(Contract, #9001) ...'), 9001);
  assert.equal(errorCode('nothing'), null);
  assert.equal(txHashFrom(`Signing transaction: ${'ab'.repeat(32)}`), 'ab'.repeat(32));
  assert.equal(redact(`secret S${'A'.repeat(55)} end`), 'secret <redacted-secret> end');
  assert.deepEqual(selectPhases('3'), ['setup']);
  assert.equal(selectPhases('all').length, 9);
  assert.throws(() => selectPhases('bogus'));
});
