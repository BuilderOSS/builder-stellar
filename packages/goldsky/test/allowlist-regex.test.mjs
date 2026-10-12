/**
 * The six dynamic-table allowlists are the only way a module's events enter the
 * pipeline and get a contract_role. They key on the field names of the Manager's
 * DaoAddresses struct with a regexp over the raw DaoCreated data; nothing else
 * ties the two together, so this test does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../src/contract-events.mjs';

const template = readFileSync(new URL('../templates/builder-stellar-events.yaml.mustache', import.meta.url), 'utf8');
const storage = readFileSync(join(repoRoot, 'contracts/manager/src/storage.rs'), 'utf8');
const daoAddressFields = storage.match(/pub struct DaoAddresses \{([\s\S]*?)\n\}/)[1].match(/pub (\w+):/g).map((m) => m.slice(4, -1));
// Each dynamic table block: its name and the regexp that fills it.
const tables = [...template.matchAll(/^  (dao_\w+):\n    type: dynamic_table[\s\S]*?regexp_extract\(data, '([^']+)', 1\)/gm)].map((m) => ({ name: m[1], pattern: m[2] }));
const patterns = tables.map((t) => t.pattern);
const keyOf = (pattern) => pattern.match(/"symbol"\\s\*:\\s\*"(\w+)"/)[1];

test('one dynamic table per DaoAddresses field, and the role CASE covers each', () => {
  assert.deepEqual(patterns.map(keyOf).sort(), [...daoAddressFields].sort());
  for (const { name, pattern } of tables) {
    const field = keyOf(pattern);
    assert.match(template, new RegExp(`dynamic_table_check\\('${name}', contract_id\\) THEN '${field}'`), `${name} -> ${field}`);
    assert.match(template, new RegExp(`OR dynamic_table_check\\('${name}', contract_id\\)`), `${name} in the stream filter`);
  }
});

test('each pattern extracts its module address from a DaoCreated payload and skips the same key in wasm_hashes', () => {
  // The Goldsky XDR-JSON shape: a map of {key:{symbol}, val:{...}} entries, keys in field order.
  const modules = { map: daoAddressFields.map((k) => ({ key: { symbol: k }, val: { address: `C${k.toUpperCase()}` } })) };
  const hashes = { map: daoAddressFields.map((k) => ({ key: { symbol: k }, val: { bytes: 'aa' } })) };
  const data = JSON.stringify({ map: [
    { key: { symbol: 'created_ledger' }, val: { u64: '1' } },
    { key: { symbol: 'modules' }, val: modules },
    { key: { symbol: 'slug' }, val: { string: 'token' } },
    { key: { symbol: 'wasm_hashes' }, val: hashes }
  ] });
  for (const pattern of patterns) {
    const key = keyOf(pattern);
    assert.equal(data.match(new RegExp(pattern))?.[1], `C${key.toUpperCase()}`, key);
  }
});
