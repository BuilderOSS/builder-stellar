/**
 * The dynamic-table allowlists are the only way a contract's events enter the
 * pipeline and get a contract_role (docs/designs/membership-models.md § 7):
 *   - the core four come from DaoCreated, keyed on the core DaoAddresses fields;
 *   - modules come from the Token's ModuleRegistered emitted by a known DAO Token,
 *     one table per known kind (common::modules::KIND_*) plus the catch-all.
 * They key on contract field and kind names with a regexp over raw event data;
 * nothing else ties the two together, so this test does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../src/contract-events.mjs';

const template = readFileSync(new URL('../templates/builder-stellar-events.yaml.mustache', import.meta.url), 'utf8');
const storage = readFileSync(join(repoRoot, 'contracts/manager/src/storage.rs'), 'utf8');
const modulesRs = readFileSync(join(repoRoot, 'contracts/common/src/modules.rs'), 'utf8');
const tokenEvents = readFileSync(join(repoRoot, 'contracts/token/src/events.rs'), 'utf8');

// DaoAddresses: the core four are plain Address fields; modules are Option<Address>.
const daoAddressFields = [...storage.match(/pub struct DaoAddresses \{([\s\S]*?)\n\}/)[1].matchAll(/pub (\w+): ([\w<>]+),/g)];
const coreFields = daoAddressFields.filter((m) => m[2] === 'Address').map((m) => m[1]);
const moduleFields = daoAddressFields.filter((m) => m[2] === 'Option<Address>').map((m) => m[1]);
// Known registry kinds and the role each yields.
const kinds = [...modulesRs.matchAll(/pub const KIND_\w+: &str = "(\w+)";/g)].map((m) => m[1]);

// Each dynamic table block: its name, the regexp that fills it, its WHERE clause and (module
// tables) the kind it admits.
const tables = [...template.matchAll(/^  (dao_\w+):\n    type: dynamic_table[\s\S]*?regexp_extract\(data, '([^']+)', 1\) AS contract_id\n      FROM stellar_events\n([\s\S]*?)\n\n/gm)]
  .map((m) => ({ name: m[1], pattern: m[2], where: m[3], kind: m[3].match(/topics LIKE '%"(\w+)"%'/)?.[1] ?? null }));
const keyOf = (pattern) => pattern.match(/"symbol"\\s\*:\\s\*"(\w+)"/)[1];
const isModuleTable = (t) => t.where.includes("topics LIKE '%module_registered%'");
const core = tables.filter((t) => !isModuleTable(t));
const perKind = tables.filter((t) => isModuleTable(t) && t.kind);
const catchAll = tables.filter((t) => isModuleTable(t) && !t.kind);

test('the core four DaoAddresses fields each have a DaoCreated table, and the role CASE covers each', () => {
  assert.deepEqual(coreFields.sort(), ['governor', 'metadata', 'token', 'treasury']);
  assert.deepEqual(core.map((t) => keyOf(t.pattern)).sort(), [...coreFields].sort());
  for (const { name, pattern } of core) {
    const field = keyOf(pattern);
    assert.match(template, new RegExp(`dynamic_table_check\\('${name}', contract_id\\) THEN '${field}'`), `${name} -> ${field}`);
    assert.match(template, new RegExp(`OR dynamic_table_check\\('${name}', contract_id\\)`), `${name} in the stream filter`);
  }
});

test('each known module kind has a table filled from ModuleRegistered, and the role CASE names it', () => {
  // Every optional DaoAddresses module field is a known kind.
  for (const field of moduleFields) assert.ok(kinds.includes(field), `${field} is a KIND_* constant`);
  assert.deepEqual(perKind.map((t) => t.kind).sort(), [...kinds].sort());
  for (const { name, kind, pattern } of perKind) {
    assert.equal(keyOf(pattern), 'address', `${name} reads the registered address`);
    assert.match(template, new RegExp(`dynamic_table_check\\('${name}', contract_id\\) THEN '${kind}'`), `${name} -> ${kind}`);
  }
  // Known kinds win over the catch-all: the CASE tries them first.
  const caseBlock = template.match(/CASE([\s\S]*?)END AS contract_role/)[1];
  const order = [...caseBlock.matchAll(/dynamic_table_check\('(\w+)'/g)].map((m) => m[1]);
  for (const { name } of perKind) assert.ok(order.indexOf(name) < order.indexOf('dao_modules'), `${name} before dao_modules`);
});

test('the catch-all admits every registered module into the stream as role module', () => {
  assert.equal(catchAll.length, 1);
  assert.equal(catchAll[0].name, 'dao_modules');
  assert.match(template, /dynamic_table_check\('dao_modules', contract_id\) THEN 'module'/);
  assert.match(template, /OR dynamic_table_check\('dao_modules', contract_id\)/);
  // Every module table reads only registrations emitted by a known DAO Token.
  for (const table of [...perKind, ...catchAll]) {
    assert.match(table.where, /AND dynamic_table_check\('dao_tokens', contract_id\)/, `${table.name} is gated on known DAO Tokens`);
    assert.match(table.where, /AND in_successful_contract_call/, `${table.name} skips failed calls`);
  }
});

test('ModuleRegistered carries kind as a topic and address in its data, as the tables assume', () => {
  const event = tokenEvents.match(/pub struct ModuleRegistered \{([\s\S]*?)\n\}/)[1];
  assert.match(event, /#\[topic\]\s*pub kind: Symbol/);
  assert.match(event, /pub address: Address/);
});

test('each pattern extracts its address from its event and skips the same key elsewhere', () => {
  // DaoCreated, in the Goldsky XDR-JSON shape: modules hold the core four plus Option module
  // addresses (void when absent); wasm_hashes repeats the keys with bytes.
  const modules = { map: [...coreFields.map((k) => ({ key: { symbol: k }, val: { address: `C${k.toUpperCase()}` } })),
    ...moduleFields.map((k) => ({ key: { symbol: k }, val: 'void' }))] };
  const hashes = { map: coreFields.map((k) => ({ key: { symbol: k }, val: { bytes: 'aa' } })) };
  const created = JSON.stringify({ map: [
    { key: { symbol: 'created_ledger' }, val: { u64: '1' } },
    { key: { symbol: 'modules' }, val: modules },
    { key: { symbol: 'slug' }, val: { string: 'token' } },
    { key: { symbol: 'wasm_hashes' }, val: hashes }
  ] });
  for (const { pattern } of core) {
    const key = keyOf(pattern);
    assert.equal(created.match(new RegExp(pattern))?.[1], `C${key.toUpperCase()}`, key);
  }
  // ModuleRegistered: topics [module_registered, kind], data { address, non_voting }.
  for (const kind of [...kinds, 'custom_vault']) {
    const topics = JSON.stringify([{ symbol: 'module_registered' }, { symbol: kind }]);
    const data = JSON.stringify({ map: [{ key: { symbol: 'address' }, val: { address: `CMOD${kind.toUpperCase()}` } }, { key: { symbol: 'non_voting' }, val: { bool: true } }] });
    for (const table of [...perKind, ...catchAll]) {
      const admitted = !table.kind || topics.includes(`"${table.kind}"`);
      assert.equal(admitted, !table.kind || table.kind === kind, `${table.name} admits ${kind}`);
      if (admitted) assert.equal(data.match(new RegExp(table.pattern))?.[1], `CMOD${kind.toUpperCase()}`, `${table.name} ${kind}`);
    }
  }
});
