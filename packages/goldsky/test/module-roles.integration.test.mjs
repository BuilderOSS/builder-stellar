/**
 * Module roles across DAOs (migration 0015): a known role (auction, marketplace,
 * claims) belongs to the DAO the Manager created the module for. A DAO that
 * registers another DAO's module sees it as role `module`: not as its own
 * auction, marketplace or claims module, and without that module's events.
 *
 * Runs on the database db/test-migrations.sh prepares, after the read-model
 * test, under its own deployment id so the two scenarios never meet. Skipped
 * without TEST_DATABASE_URL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadInvoke } from './load-script.mjs';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const skip = !DATABASE_URL && 'set TEST_DATABASE_URL to a migrated database';

const rawScript = loadInvoke('raw-events.script.js');
const decodeScript = loadInvoke('decoded-events.script.js');
const activityScript = loadInvoke('activity-feed.script.js');

function psql(sql) {
  return execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-A', '-t'], {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}
const rows = (sql) => JSON.parse(psql(`SELECT coalesce(jsonb_agg(to_jsonb(_r)), '[]'::jsonb) FROM (${sql}) _r`).trim());

const addr = (v) => ({ address: v });
const sym = (v) => ({ symbol: v });
const u32 = (v) => ({ u32: v });
const u64 = (v) => ({ u64: String(v) });
const i128 = (v) => ({ i128: String(v) });
const bool = (v) => ({ bool: v });
const bytes = (v) => ({ bytes: v });
const str = (v) => ({ string: v });
const VOID = 'void';
const dataMap = (obj) => ({ map: Object.entries(obj).map(([key, val]) => ({ key: sym(key), val })) });

const DEPLOYMENT = 'manager:CROLEMGR';
const MANAGER = 'CROLEMGR';

const events = [];
function emit(role, contract, name, { topics = [], data = {}, ledger, tx = 0, evt = 0 }) {
  const hash = `rtx${ledger}-${tx}`;
  events.push({
    event_id: `${DEPLOYMENT}:${ledger}-${hash}-op-0-event-${evt}`,
    deployment_id: DEPLOYMENT,
    contract_id: contract,
    contract_role: role,
    topics: JSON.stringify([sym(name), ...topics]),
    data: JSON.stringify(dataMap(data)),
    transaction_hash: hash,
    transaction_successful: true,
    transaction_index: tx,
    operation_index: null,
    event_index: null,
    operation_type: 'invoke_host_function',
    ledger_sequence: ledger,
    ledger_hash: `rlh${ledger}`,
    ledger_closed_at: String(Date.UTC(2026, 10, 1) + ledger * 5000),
    _gs_op: 'i'
  });
}

// DaoCreated for a DAO with the given modules (each kind it lacks is void), after the
// Token registered each of them in the same transaction, as create_dao does.
function createDao(token, ledger, modules) {
  const core = { token, metadata: `${token}META`, governor: `${token}GOV`, treasury: `${token}TRE` };
  Object.entries(modules).forEach(([kind, address], k) =>
    emit('token', token, 'module_registered', { topics: [sym(kind)], data: { address: addr(address), non_voting: bool(kind !== 'claims') }, ledger, evt: k })
  );
  const all = { ...core, auction: modules.auction, marketplace: modules.marketplace, claims: modules.claims };
  emit('manager', MANAGER, 'dao_created', {
    topics: [addr(token), addr('GDEPLOYER'), addr('GLAUNCH')],
    data: {
      created_ledger: u64(ledger),
      modules: dataMap(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v ? addr(v) : VOID]))),
      wasm_hashes: dataMap(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v ? bytes(`h-${k}`) : VOID]))),
      slug: str(token.toLowerCase())
    },
    ledger,
    evt: 10
  });
}

function scenario() {
  // DAO A has a Marketplace and an Auction from create_dao, then a ClaimMinter from create_module.
  createDao('CTOKA', 400, { auction: 'CAUCA', marketplace: 'CMKTA' });
  // DAO B has only the core four.
  createDao('CTOKB', 401, {});
  emit('manager', MANAGER, 'module_created', { topics: [addr('CTOKA'), sym('claims')], data: { n: u32(1), address: addr('CCLMA') }, ledger: 402 });
  emit('token', 'CTOKA', 'module_registered', { topics: [sym('claims')], data: { address: addr('CCLMA'), non_voting: bool(false) }, ledger: 402, evt: 1 });

  // DAO B registers each of DAO A's modules by vote, under the same kinds.
  emit('token', 'CTOKB', 'module_registered', { topics: [sym('marketplace')], data: { address: addr('CMKTA'), non_voting: bool(true) }, ledger: 410 });
  emit('token', 'CTOKB', 'module_registered', { topics: [sym('auction')], data: { address: addr('CAUCA'), non_voting: bool(true) }, ledger: 410, evt: 1 });
  emit('token', 'CTOKB', 'module_registered', { topics: [sym('claims')], data: { address: addr('CCLMA'), non_voting: bool(false) }, ledger: 410, evt: 2 });

  // DAO A's modules keep working: a pool opens, the auction pauses and a claim list opens.
  emit('marketplace', 'CMKTA', 'pool_opened', {
    topics: [u32(1)],
    data: { price: i128(100), asset: addr('CXLM'), expires_at: u64(5000000), size: u32(2), max_per_buyer: u32(1), max_sold_per_period: u32(1), period_secs: u64(86400) },
    ledger: 420
  });
  emit('auction', 'CAUCA', 'paused', { ledger: 421 });
  emit('claims', 'CCLMA', 'list_opened', {
    topics: [u32(1)],
    data: { root: bytes('r1'), tree_uri: str('ipfs://tree'), asset: addr('CXLM'), price: i128(0), expires_at: u64(5000000), total: u32(1), assurance: VOID },
    ledger: 422
  });

  // DAO A unregisters its Auction and registers it again: still its own, so still role auction.
  emit('token', 'CTOKA', 'module_unregistered', { topics: [sym('auction')], data: { address: addr('CAUCA') }, ledger: 430 });
  emit('token', 'CTOKA', 'module_registered', { topics: [sym('auction')], data: { address: addr('CAUCA'), non_voting: bool(true) }, ledger: 431 });
}

test('a known role belongs to the DAO the Manager created the module for', { skip }, () => {
  scenario();
  const raw = events.map(rawScript);
  const decoded = raw.map(decodeScript);
  const activity = decoded.map(activityScript);
  assert.ok([...raw, ...decoded, ...activity].every(Boolean), 'every event survives every transform');
  for (const [table, objects] of [['chain.raw_events', raw], ['chain.decoded_events', decoded], ['app.activity_feed_events', activity]]) {
    const [schema, name] = table.split('.');
    const columns = rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${name}'`)
      .map((r) => r.c)
      .filter((c) => c !== 'ingested_at');
    const list = Object.keys(objects[0]).filter((key) => columns.includes(key)).join(', ');
    psql(`INSERT INTO ${table} (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::${table}, $json$${JSON.stringify(objects)}$json$::jsonb)`);
  }
  const where = `deployment_id = '${DEPLOYMENT}'`;

  // DAO A's registrations carry the known roles; DAO B's registrations of the same contracts are role module.
  assert.deepEqual(
    rows(`SELECT dao_id, module_contract, kind, module_role, created_wasm_hash FROM manager.module_registrations WHERE ${where} ORDER BY dao_id, module_contract, registered_pos`),
    [
      { dao_id: 'CTOKA', module_contract: 'CAUCA', kind: 'auction', module_role: 'auction', created_wasm_hash: 'h-auction' },
      { dao_id: 'CTOKA', module_contract: 'CAUCA', kind: 'auction', module_role: 'auction', created_wasm_hash: 'h-auction' },
      { dao_id: 'CTOKA', module_contract: 'CCLMA', kind: 'claims', module_role: 'claims', created_wasm_hash: null },
      { dao_id: 'CTOKA', module_contract: 'CMKTA', kind: 'marketplace', module_role: 'marketplace', created_wasm_hash: 'h-marketplace' },
      { dao_id: 'CTOKB', module_contract: 'CAUCA', kind: 'auction', module_role: 'module', created_wasm_hash: 'h-auction' },
      { dao_id: 'CTOKB', module_contract: 'CCLMA', kind: 'claims', module_role: 'module', created_wasm_hash: null },
      { dao_id: 'CTOKB', module_contract: 'CMKTA', kind: 'marketplace', module_role: 'module', created_wasm_hash: 'h-marketplace' }
    ]
  );
  assert.deepEqual(
    rows(`SELECT dao_id, module_contract, module_role, registered FROM manager.dao_modules WHERE ${where} AND module_contract IN ('CAUCA', 'CMKTA', 'CCLMA') ORDER BY dao_id, module_contract`),
    [
      { dao_id: 'CTOKA', module_contract: 'CAUCA', module_role: 'auction', registered: true },
      { dao_id: 'CTOKA', module_contract: 'CCLMA', module_role: 'claims', registered: true },
      { dao_id: 'CTOKA', module_contract: 'CMKTA', module_role: 'marketplace', registered: true },
      { dao_id: 'CTOKB', module_contract: 'CAUCA', module_role: 'module', registered: true },
      { dao_id: 'CTOKB', module_contract: 'CCLMA', module_role: 'module', registered: true },
      { dao_id: 'CTOKB', module_contract: 'CMKTA', module_role: 'module', registered: true }
    ]
  );

  // manager.daos names each module only for DAO A, so the app never offers DAO A's market as DAO B's.
  assert.deepEqual(
    rows(`SELECT dao_id, auction_contract, marketplace_contract, claims_contract FROM manager.daos WHERE ${where} ORDER BY dao_id`),
    [
      { dao_id: 'CTOKA', auction_contract: 'CAUCA', marketplace_contract: 'CMKTA', claims_contract: 'CCLMA' },
      { dao_id: 'CTOKB', auction_contract: null, marketplace_contract: null, claims_contract: null }
    ]
  );

  // The modules' events, the domain views and the feed are DAO A's only.
  assert.deepEqual(
    rows(`SELECT DISTINCT dao_id FROM manager.module_events WHERE ${where} AND contract_id IN ('CAUCA', 'CMKTA', 'CCLMA')`),
    [{ dao_id: 'CTOKA' }]
  );
  assert.deepEqual(rows(`SELECT dao_id, pool_id FROM marketplace.pools WHERE ${where}`), [{ dao_id: 'CTOKA', pool_id: 1 }]);
  assert.deepEqual(rows(`SELECT dao_id, list_id FROM claims.lists WHERE ${where}`), [{ dao_id: 'CTOKA', list_id: 1 }]);
  assert.deepEqual(
    rows(`SELECT DISTINCT dao_id FROM app.activity_feed WHERE ${where} AND contract_id IN ('CAUCA', 'CMKTA', 'CCLMA')`),
    [{ dao_id: 'CTOKA' }]
  );

  // The Manager created each module for DAO A, whether from create_dao or create_module.
  assert.deepEqual(
    rows(`SELECT dao_id, kind, contract_id FROM manager.created_modules WHERE ${where} ORDER BY contract_id`),
    [
      { dao_id: 'CTOKA', kind: 'auction', contract_id: 'CAUCA' },
      { dao_id: 'CTOKA', kind: 'claims', contract_id: 'CCLMA' },
      { dao_id: 'CTOKA', kind: 'marketplace', contract_id: 'CMKTA' }
    ]
  );
});
