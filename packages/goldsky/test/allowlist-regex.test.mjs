/**
 * The dynamic-table allowlists are the only way a contract's events enter the
 * pipeline and get a contract_role (docs/designs/membership-models.md § 7):
 *   - the core four come from DaoCreated, keyed on the core DaoAddresses fields;
 *   - each known module kind (common::modules::KIND_*) has a table filled from the
 *     Manager's own DaoCreated.modules.<kind> and ModuleCreated, and from the Token's
 *     ModuleRegistered emitted by a known DAO Token; a catch-all takes every registration.
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
const managerEvents = readFileSync(join(repoRoot, 'contracts/manager/src/events.rs'), 'utf8');

// DaoAddresses: the core four are plain Address fields; modules are Option<Address>.
const daoAddressFields = [...storage.match(/pub struct DaoAddresses \{([\s\S]*?)\n\}/)[1].matchAll(/pub (\w+): ([\w<>]+),/g)];
const coreFields = daoAddressFields.filter((m) => m[2] === 'Address').map((m) => m[1]);
const moduleFields = daoAddressFields.filter((m) => m[2] === 'Option<Address>').map((m) => m[1]);
// Known registry kinds and the role each yields.
const kinds = [...modulesRs.matchAll(/pub const KIND_\w+: &str = "(\w+)";/g)].map((m) => m[1]);

// Each dynamic table block: its name, every regexp that fills it and its SQL.
const tables = [...template.matchAll(/^  (dao_\w+):\n    type: dynamic_table\n([\s\S]*?)\n\n/gm)].map((m) => ({
  name: m[1],
  sql: m[2],
  patterns: [...m[2].matchAll(/regexp_extract\(data, '([^']+)', 1\)/g)].map((p) => p[1]),
  kind: m[2].match(/topics LIKE '%"(\w+)"%'/)?.[1] ?? null
}));
const keyOf = (pattern) => pattern.match(/"symbol"\\s\*:\\s\*"(\w+)"/)[1];
const isModuleTable = (t) => t.sql.includes("topics LIKE '%module_registered%'");
const core = tables.filter((t) => !isModuleTable(t));
const perKind = tables.filter((t) => isModuleTable(t) && t.kind);
const catchAll = tables.filter((t) => isModuleTable(t) && !t.kind);
const caseBlock = template.match(/CASE\n([\s\S]*?)END AS contract_role/)[1];
const streamFilter = template.match(/AND \(\n\s+contract_id = '\{\{MANAGER_CONTRACT_ID\}\}'\n([\s\S]*?)\n\s+\)\n/)[1];

test('the core four DaoAddresses fields each have a DaoCreated table, and the role CASE covers each', () => {
  assert.deepEqual(coreFields.sort(), ['governor', 'metadata', 'token', 'treasury']);
  assert.deepEqual(core.map((t) => keyOf(t.patterns[0])).sort(), [...coreFields].sort());
  for (const { name, patterns, sql } of core) {
    const field = keyOf(patterns[0]);
    assert.match(sql, /topics LIKE '%dao_created%'/);
    assert.match(caseBlock, new RegExp(`dynamic_table_check\\('${name}', contract_id\\) THEN '${field}'`), `${name} -> ${field}`);
    assert.match(streamFilter, new RegExp(`OR dynamic_table_check\\('${name}', contract_id\\)`), `${name} in the stream filter`);
  }
});

test('each known module kind has a table, in the role CASE before the catch-all and in the stream filter', () => {
  // Every optional DaoAddresses module field is a known kind.
  for (const field of moduleFields) assert.ok(kinds.includes(field), `${field} is a KIND_* constant`);
  assert.deepEqual(perKind.map((t) => t.kind).sort(), [...kinds].sort());
  const order = [...caseBlock.matchAll(/dynamic_table_check\('(\w+)'/g)].map((m) => m[1]);
  for (const { name, kind } of perKind) {
    assert.match(caseBlock, new RegExp(`dynamic_table_check\\('${name}', contract_id\\) THEN '${kind}'`), `${name} -> ${kind}`);
    assert.ok(order.indexOf(name) < order.indexOf('dao_modules'), `${name} before dao_modules`);
    // A module of a known kind must not depend on the catch-all to enter the stream.
    assert.match(streamFilter, new RegExp(`OR dynamic_table_check\\('${name}', contract_id\\)`), `${name} in the stream filter`);
  }
});

test('modules create_dao deploys come from the Manager, not only from the Token registry', () => {
  // create_dao registers modules before it emits DaoCreated, so a ModuleRegistered gated on
  // dao_tokens there would need one dynamic table to see another's same-batch write.
  const managerSource = readFileSync(join(repoRoot, 'contracts/manager/src/contract.rs'), 'utf8');
  const start = managerSource.indexOf('pub fn create_dao');
  const emit = managerSource.indexOf('emit_dao_created(', start);
  assert.ok(start > 0 && emit > start, 'create_dao and its DaoCreated emit found');
  assert.ok(managerSource.slice(start, emit).includes('register_module('), 'create_dao registers modules before DaoCreated');
  for (const table of perKind) {
    if (!moduleFields.includes(table.kind)) {
      assert.equal(table.patterns.length, 1, `${table.name}: a kind create_dao does not deploy reads the registry only`);
      continue;
    }
    assert.match(table.sql, /contract_id = '\{\{MANAGER_CONTRACT_ID\}\}' AND topics LIKE '%dao_created%'/, `${table.name}: DaoCreated branch`);
    assert.match(table.sql, new RegExp(`contract_id = '\\{\\{MANAGER_CONTRACT_ID\\}\\}' AND topics LIKE '%module_created%' AND topics LIKE '%"${table.kind}"%'`), `${table.name}: ModuleCreated branch`);
    assert.deepEqual(table.patterns.map(keyOf), [table.kind, 'address'], `${table.name}: DaoCreated key, then the registered address`);
  }
  assert.match(managerEvents, /pub struct ModuleCreated \{[\s\S]*?#\[topic\]\s*pub kind: Symbol,[\s\S]*?pub address: Address,/);
});

test('the registry branch and the catch-all read only registrations a known DAO Token emitted', () => {
  assert.equal(catchAll.length, 1);
  assert.equal(catchAll[0].name, 'dao_modules');
  assert.match(caseBlock, /dynamic_table_check\('dao_modules', contract_id\) THEN 'module'/);
  assert.match(streamFilter, /OR dynamic_table_check\('dao_modules', contract_id\)/);
  for (const table of [...perKind, ...catchAll]) {
    assert.match(table.sql, /topics LIKE '%module_registered%'[^\n]*dynamic_table_check\('dao_tokens', contract_id\)|AND dynamic_table_check\('dao_tokens', contract_id\)/, `${table.name} is gated on known DAO Tokens`);
    assert.match(table.sql, /AND in_successful_contract_call/, `${table.name} skips failed calls`);
  }
  const event = tokenEvents.match(/pub struct ModuleRegistered \{([\s\S]*?)\n\}/)[1];
  assert.match(event, /#\[topic\]\s*pub kind: Symbol/);
  assert.match(event, /pub address: Address/);
});

test('each pattern extracts its address from its event and skips the same key elsewhere', () => {
  // DaoCreated, in the Goldsky XDR-JSON shape: modules hold the core four plus the Option module
  // addresses (void when absent); wasm_hashes repeats the keys with bytes.
  const created = (present) => JSON.stringify({ map: [
    { key: { symbol: 'created_ledger' }, val: { u64: '1' } },
    { key: { symbol: 'modules' }, val: { map: [
      ...coreFields.map((k) => ({ key: { symbol: k }, val: { address: `C${k.toUpperCase()}` } })),
      ...moduleFields.map((k) => ({ key: { symbol: k }, val: present ? { address: `C${k.toUpperCase()}` } : 'void' }))
    ] } },
    { key: { symbol: 'slug' }, val: { string: 'token' } },
    { key: { symbol: 'wasm_hashes' }, val: { map: [...coreFields, ...moduleFields].map((k) => ({ key: { symbol: k }, val: { bytes: 'aa' } })) } }
  ] });
  for (const { patterns } of core) {
    const key = keyOf(patterns[0]);
    assert.equal(created(true).match(new RegExp(patterns[0]))?.[1], `C${key.toUpperCase()}`, key);
  }
  for (const table of perKind.filter((t) => moduleFields.includes(t.kind))) {
    const [fromCreated] = table.patterns;
    assert.equal(created(true).match(new RegExp(fromCreated))?.[1], `C${table.kind.toUpperCase()}`, `${table.name} from DaoCreated`);
    assert.equal(created(false).match(new RegExp(fromCreated)), null, `${table.name}: no module of the kind, no address`);
  }
  // ModuleRegistered / ModuleCreated: data { address, ... }; the kind is a topic.
  for (const kind of [...kinds, 'custom_vault']) {
    const topics = JSON.stringify([{ symbol: 'module_registered' }, { symbol: kind }]);
    const data = JSON.stringify({ map: [{ key: { symbol: 'address' }, val: { address: `CMOD${kind.toUpperCase()}` } }, { key: { symbol: 'non_voting' }, val: { bool: true } }] });
    for (const table of [...perKind, ...catchAll]) {
      const admitted = !table.kind || topics.includes(`"${table.kind}"`);
      assert.equal(admitted, !table.kind || table.kind === kind, `${table.name} admits ${kind}`);
      if (admitted) assert.equal(data.match(new RegExp(table.patterns.at(-1)))?.[1], `CMOD${kind.toUpperCase()}`, `${table.name} ${kind}`);
    }
  }
});
