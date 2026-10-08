/**
 * Read-model integration test: pipeline transforms -> Postgres -> views -> Prisma.
 *
 * Plays a full DAO lifecycle through the REAL raw/decoded/activity transform
 * scripts, inserts the output into the landing tables of a freshly migrated
 * database, and asserts on the views the web app reads. Also checks that the
 * pipeline sink schemas and apps/web/prisma/schema.prisma match the database.
 *
 * Needs a migrated, empty database:  TEST_DATABASE_URL=postgres://... node --test
 * (db/test-migrations.sh with TEST_DATABASE_URL sets one up). Skipped otherwise.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { allEvents } from '../src/contract-events.mjs';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const skip = !DATABASE_URL && 'set TEST_DATABASE_URL to a migrated empty database';

function loadInvoke(name) {
  const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
  return new Function(`${source}\nreturn invoke;`)();
}
const rawScript = loadInvoke('raw-events.script.js');
const decodeScript = loadInvoke('decoded-events.script.js');
const activityScript = loadInvoke('activity-feed.script.js');

function psql(sql) {
  return execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-A', '-t', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function rows(sql) {
  const out = psql(`SELECT coalesce(jsonb_agg(to_jsonb(_r)), '[]'::jsonb) FROM (${sql}) _r`).trim();
  return JSON.parse(out);
}
const one = (sql) => {
  const result = rows(sql);
  assert.equal(result.length, 1, `expected exactly one row for: ${sql}`);
  return result[0];
};

// ---------------------------------------------------------------------------
// XDR-JSON builders and the event factory (shape of the Goldsky stellar dataset)
// ---------------------------------------------------------------------------
const addr = (v) => ({ address: v });
const sym = (v) => ({ symbol: v });
const u32 = (v) => ({ u32: v });
const u64 = (v) => ({ u64: String(v) });
const u128 = (v) => ({ u128: String(v) });
const i128 = (v) => ({ i128: String(v) });
const bool = (v) => ({ bool: v });
const str = (v) => ({ string: v });
const bytes = (v) => ({ bytes: v });
const vec = (...v) => ({ vec: v });
const VOID = 'void';
const dataMap = (obj) => ({ map: Object.entries(obj).map(([key, val]) => ({ key: sym(key), val })) });

const DEPLOYMENT = 'manager:CMANAGER';
const dao = (n) => ({
  token: `CTOK${n}`, metadata: `CMETA${n}`, auction: `CAUC${n}`,
  governor: `CGOV${n}`, treasury: `CTRE${n}`, marketplace: `CMKT${n}`
});
const modules = (n) => dataMap(Object.fromEntries(Object.entries(dao(n)).map(([k, v]) => [k, addr(v)])));

const events = [];
const emitted = new Map(); // event name -> { topics, data } as used by the fixtures
function emit(role, contract, name, { topics = [], data = {}, ledger, tx = 0, evt = 0 }) {
  emitted.set(name, { topics: topics.length, data: Object.keys(data) });
  const hash = `tx${ledger}-${tx}`;
  events.push({
    // Same shape as pipeline dao_events: event_id is `${deployment}:${dataset id}`;
    // operation/event index are NULL and recovered from the id by the database.
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
    ledger_hash: `lh${ledger}`,
    ledger_closed_at: `2026-10-01 00:${String(Math.floor(ledger / 60) % 60).padStart(2, '0')}:${String(ledger % 60).padStart(2, '0')}`,
    _gs_op: 'i'
  });
}

function buildScenario() {
  const d1 = dao(1);
  const MINTER = 'CMINTER';

  // --- manager ---------------------------------------------------------------
  emit('manager', 'CMANAGER', 'manager_initialized', { topics: [addr('GADMIN')], data: { version: str('0.1.0'), deployed_at: u64(1) }, ledger: 100 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('aa')], data: { name: str('token'), version: str('0.1.0'), published_at: u64(5) }, ledger: 101 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('bb')], data: { name: str('auction'), version: str('0.1.0'), published_at: u64(6) }, ledger: 101, evt: 1 });
  emit('manager', 'CMANAGER', 'implementation_revoked', { topics: [bytes('bb')], data: { revoked_at: u64(9) }, ledger: 102 });
  emit('manager', 'CMANAGER', 'current_implementations_updated', {
    data: { token: bytes('aa'), metadata: bytes('cc'), auction: bytes('dd'), governor: bytes('ee'), treasury: bytes('ff'), marketplace: bytes('11') }, ledger: 103
  });
  emit('manager', 'CMANAGER', 'dao_created', { topics: [addr('CTOK1'), addr('GDEPLOYER'), addr('GLAUNCH')], data: { created_ledger: u64(110), modules: modules(1) }, ledger: 110 });
  emit('manager', 'CMANAGER', 'dao_created', { topics: [addr('CTOK2'), addr('GDEPLOYER2'), addr('GLAUNCH2')], data: { created_ledger: u64(111), modules: modules(2) }, ledger: 111 });
  emit('token', d1.token, 'token_initialized', { topics: [addr('GOWNER')], data: { uri: str('ipfs://alpha'), name: str('Alpha'), symbol: str('ALP'), version: str('0.1.0') }, ledger: 112 });
  emit('metadata', d1.metadata, 'metadata_initialized', {
    topics: [addr(d1.token)],
    data: { renderer_base: str('https://r/'), version: str('0.1.0'), owner: addr('GOWNER'), project_uri: str('ipfs://p0'), description: str('Alpha DAO'), contract_image: str('img0') },
    ledger: 113
  });
  emit('auction', d1.auction, 'auction_initialized', {
    topics: [addr('GOWNER')],
    data: { token_contract: addr(d1.token), treasury: addr(d1.treasury), duration: u64(86400), reserve_price: i128(10), min_bid_increment_percent: u32(5), time_buffer: u64(300), payment_token: addr('CXLM'), version: str('0.1.0') },
    ledger: 114
  });
  emit('token', d1.token, 'mint_authority_changed', { topics: [addr(MINTER)], data: { old_enabled: bool(false), enabled: bool(true), changed_by: addr('GOWNER') }, ledger: 115 });
  emit('manager', 'CMANAGER', 'dao_launched', {
    topics: [addr('CTOK1')],
    data: { launched_ledger: u64(116), modules: modules(1), launch_auction: bool(false), launch_marketplace: bool(true) }, ledger: 116
  });
  emit('auction', d1.auction, 'unpaused', { ledger: 130 });

  // --- token: a 6-token batch mint in ONE transaction (18 events, indexes >= 10),
  // each mint bumping GALICE's voting power. The last event must win even though
  // 'event-9' sorts after 'event-17' as text.
  for (let k = 0; k < 6; k += 1) {
    emit('token', d1.token, 'mint', { topics: [addr('GALICE')], data: { token_id: u32(k + 1) }, ledger: 120, tx: 3, evt: 3 * k });
    emit('token', d1.token, 'mint_with_minter', { topics: [addr(MINTER), addr('GALICE')], data: { token_id: u32(k + 1) }, ledger: 120, tx: 3, evt: 3 * k + 1 });
    emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(k), new_votes: u128(k + 1) }, ledger: 120, tx: 3, evt: 3 * k + 2 });
  }
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr('GBOB')], data: { token_id: u32(1) }, ledger: 121, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(6), new_votes: u128(5) }, ledger: 121, evt: 1 });
  emit('token', d1.token, 'delegate_changed', { topics: [addr('GBOB')], data: { from_delegate: VOID, to_delegate: addr('GBOB') }, ledger: 121, evt: 2 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GBOB')], data: { previous_votes: u128(0), new_votes: u128(1) }, ledger: 121, evt: 3 });

  // A 12-event run in one transaction for another delegate: indexes 10 and 11
  // must beat index 9 (text order would put '-event-9' last).
  for (let k = 0; k < 12; k += 1) {
    emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GDAVE')], data: { previous_votes: u128(k), new_votes: u128(k + 1) }, ledger: 125, evt: k });
  }

  // --- governor / treasury -----------------------------------------------------
  emit('governor', d1.governor, 'governor_initialized', {
    topics: [addr('GOWNER')],
    data: { token_contract: addr(d1.token), treasury_contract: addr(d1.treasury), voting_delay: u32(1), voting_period: u32(10), queue_delay: u32(1), proposal_threshold: u128(1), quorum_bps: u32(1000), version: str('0.1.0') },
    ledger: 135
  });
  const created = (id, ledger) => emit('governor', d1.governor, 'proposal_created', {
    topics: [bytes(id), addr('GALICE')],
    data: {
      targets: vec(addr(d1.treasury), addr(d1.token)),
      functions: vec(sym('transfer'), sym('mint')),
      args: vec(vec(addr('GBOB'), i128(5)), vec(addr('GBOB'))),
      vote_snapshot: u32(ledger - 1), vote_end: u32(1790000000), description: str(JSON.stringify({ title: id }))
    },
    ledger
  });
  created('p1', 140);
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GALICE'), bytes('p1')], data: { vote_type: u32(1), weight: u128(5), reason: str('yes') }, ledger: 141 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GBOB'), bytes('p1')], data: { vote_type: u32(0), weight: u128(1), reason: str('') }, ledger: 142 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GCAROL'), bytes('p1')], data: { vote_type: u32(2), weight: u128(2), reason: str('') }, ledger: 142, evt: 1 });
  emit('governor', d1.governor, 'proposal_queued', { topics: [bytes('p1')], data: { eta: u64(1790000100) }, ledger: 143 });
  emit('governor', d1.governor, 'proposal_executed', { topics: [bytes('p1')], ledger: 144 });
  emit('treasury', d1.treasury, 'execute', { topics: [addr(d1.governor), addr(d1.token)], data: { function: sym('mint') }, ledger: 144, evt: 1 });
  created('p2', 145);
  created('p3', 146);
  emit('governor', d1.governor, 'proposal_cancelled', { topics: [bytes('p3')], ledger: 147 });
  emit('governor', d1.governor, 'governor_authority_changed', { topics: [addr('GAUTH')], data: { old_enabled: bool(false), enabled: bool(true) }, ledger: 148 });

  // --- auction -----------------------------------------------------------------
  const auctionCreated = (id, ledger) => emit('auction', d1.auction, 'auction_created', {
    topics: [u128(id)], data: { start_time: u64(1000), end_time: u64(2000), reserve_price: i128(10), payment_token: addr('CXLM') }, ledger
  });
  auctionCreated(7, 150);
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID1')], data: { amount: i128(20), extended: bool(false), new_end_time: u64(2000) }, ledger: 151 });
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID2')], data: { amount: i128(30), extended: bool(true), new_end_time: u64(2300) }, ledger: 152 });
  emit('auction', d1.auction, 'bid_refunded', { topics: [u128(7), addr('GBID1')], data: { amount: i128(20) }, ledger: 152, evt: 1 });
  emit('auction', d1.auction, 'auction_settled', { topics: [u128(7)], data: { winner: addr('GBID2'), amount: i128(30) }, ledger: 160 });
  emit('auction', d1.auction, 'duration_updated', { data: { duration: u64(7200), changed_by: addr('GOWNER') }, ledger: 161 });
  auctionCreated(8, 162);
  emit('auction', d1.auction, 'auction_cancelled', { topics: [u128(8)], data: { reason: u32(1), cancelled_by: addr('GOWNER') }, ledger: 163 });
  auctionCreated(9, 164);
  emit('auction', d1.auction, 'auction_settled', { topics: [u128(9)], data: { winner: VOID, amount: i128(0) }, ledger: 165 });

  // --- metadata ----------------------------------------------------------------
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(0)], data: { name: str('bg') }, ledger: 170 });
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(1)], data: { name: str('body') }, ledger: 171 });
  emit('metadata', d1.metadata, 'properties_reset', { data: { num_properties: u32(0) }, ledger: 172 });
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(0)], data: { name: str('bg2') }, ledger: 173 });
  emit('metadata', d1.metadata, 'seed_generated', { topics: [u32(3)], data: { num_properties: u32(1), selections: vec(u32(2)) }, ledger: 173, evt: 1 });
  emit('metadata', d1.metadata, 'description_updated', { data: { old_description: str('Alpha DAO'), new_description: str('Alpha DAO v2') }, ledger: 174 });
  emit('metadata', d1.metadata, 'contract_image_updated', { data: { old_image: str('img0'), new_image: str('img1') }, ledger: 175 });

  // --- marketplace -------------------------------------------------------------
  const listing = (name, id, ledger) => emit('marketplace', d1.marketplace, name, {
    topics: [u32(id)], data: { seller: addr('GSELLER'), price: i128(100), expires_at: u64(5000), fee_bps: u32(250) }, ledger
  });
  listing('primary_listing_created', 9, 180);
  emit('marketplace', d1.marketplace, 'listing_purchased', {
    topics: [u32(9), addr('GBUYER')], data: { seller: addr('GSELLER'), price: i128(100), fee: i128(2), payment_asset: addr('CXLM') }, ledger: 181
  });
  listing('secondary_listing_created', 10, 182);
  emit('marketplace', d1.marketplace, 'listing_cancelled', { topics: [u32(10)], data: { seller: addr('GSELLER') }, ledger: 183 });
  listing('secondary_listing_created', 11, 184);

  // --- minter (shared contract; tenant = token_id topic) --------------------------
  const claim = (name, token, who, amount, ledger) => emit('minter', MINTER, name, { topics: [addr(token), addr(who)], data: { amount: u128(amount) }, ledger });
  claim('merkle_claim_event', 'CTOK1', 'GALICE', 3, 190);
  claim('allowlist_claim_event', 'CTOK1', 'GBOB', 2, 191);
  claim('merkle_claim_event', 'CTOKFOREIGN', 'GMALLORY', 99, 192);
  emit('minter', MINTER, 'mint_batch_event', { topics: [addr('CTOK1')], data: { recipient_count: u32(4), total_amount: u128(8), first_token_id: u32(7) }, ledger: 193 });
  emit('minter', MINTER, 'merkle_root_set_event', { topics: [addr('CTOK1')], ledger: 194 });
  emit('minter', MINTER, 'allowlist_set_event', { topics: [addr('CTOK1')], data: { member_count: u32(4) }, ledger: 195 });
}

function insertRows(table, columns, objects) {
  const list = columns.join(', ');
  psql(`INSERT INTO ${table} (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::${table}, $json$${JSON.stringify(objects)}$json$::jsonb)`);
}
const tableColumns = (schema, table) =>
  rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${table}'`).map((r) => r.c);

let decoded;
let activity;

test('fixtures use exactly the topics and data fields the contracts emit', () => {
  // Runs without a database: keeps the hand-written scenario honest when an event changes.
  buildScenario();
  const canonical = (name) => name.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
  const truth = allEvents();
  const drift = [];
  for (const [name, used] of emitted) {
    const expected = truth[canonical(name)];
    if (!expected) { drift.push(`${name}: not a contract or library event`); continue; }
    if (used.topics !== expected.topics.length) drift.push(`${name}: fixture has ${used.topics} topics, contract ${expected.topics.length}`);
    if (JSON.stringify([...used.data].sort()) !== JSON.stringify([...expected.data].sort())) {
      drift.push(`${name}: fixture data [${used.data}] vs contract [${expected.data}]`);
    }
  }
  assert.deepEqual(drift, []);
  events.length = 0;
});

test('pipeline transforms load the landing tables', { skip }, () => {
  buildScenario();
  const raw = events.map(rawScript);
  decoded = raw.map(decodeScript);
  activity = decoded.map(activityScript);
  assert.ok([...raw, ...decoded, ...activity].every(Boolean), 'every event survives every transform');

  for (const [schema, table, objects] of [['chain', 'raw_events', raw], ['chain', 'decoded_events', decoded], ['app', 'activity_feed_events', activity]]) {
    const columns = tableColumns(schema, table).filter((c) => c !== 'ingested_at');
    const schemaFields = Object.keys(objects[0]).filter((key) => columns.includes(key));
    insertRows(`${schema}.${table}`, schemaFields, objects);
    assert.equal(one(`SELECT count(*)::int AS n FROM ${schema}.${table}`).n, events.length);
  }
});

test('landing tables fill operation/event positions from the event id and stay immutable', { skip }, () => {
  const row = one(`SELECT operation_index, event_index FROM chain.decoded_events WHERE event_id = '${DEPLOYMENT}:120-tx120-3-op-0-event-17'`);
  assert.deepEqual(row, { operation_index: 0, event_index: 17 });
  assert.throws(() => psql(`UPDATE chain.decoded_events SET event_name = 'x' WHERE event_id = '${decoded[0].event_id}'`), /immutable/);
  assert.throws(() => psql(`DELETE FROM chain.raw_events WHERE event_id = '${events[0].event_id}'`), /immutable/);
  // Replaying an identical row (pipeline restart) is accepted.
  const columns = tableColumns('chain', 'decoded_events').filter((c) => !['ingested_at'].includes(c));
  const assignments = columns.filter((c) => c !== 'event_id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const replay = decoded.slice(0, 3);
  psql(`INSERT INTO chain.decoded_events (${columns.join(', ')}) SELECT ${columns.join(', ')} FROM jsonb_populate_recordset(NULL::chain.decoded_events, $json$${JSON.stringify(replay)}$json$::jsonb) ON CONFLICT (event_id) DO UPDATE SET ${assignments}`);
});

test('manager: registry, lifecycle and implementations', { skip }, () => {
  const daos = rows(`SELECT * FROM manager.daos ORDER BY created_ledger`);
  assert.equal(daos.length, 2);
  const [a, b] = daos;
  assert.equal(a.dao_id, 'CTOK1');
  assert.equal(a.deployer, 'GDEPLOYER');
  assert.equal(a.launch_admin, 'GLAUNCH');
  assert.deepEqual(
    [a.token_contract, a.governor_contract, a.auction_contract, a.treasury_contract, a.metadata_contract, a.marketplace_contract],
    ['CTOK1', 'CGOV1', 'CAUC1', 'CTRE1', 'CMETA1', 'CMKT1']
  );
  assert.equal(a.token_name, 'Alpha');
  assert.equal(a.token_symbol, 'ALP');
  assert.equal(a.token_uri, 'ipfs://alpha');
  assert.equal(a.admin_address, 'GOWNER');
  assert.equal(a.token_description, 'Alpha DAO v2', 'description follows metadata updates');
  assert.equal(a.status, 'operational');
  assert.equal(a.launched_ledger, 116);
  // Launched with the auction disabled, then unpaused: enabled and not paused.
  assert.equal(a.auction_enabled, true);
  assert.equal(a.auction_paused, false);
  assert.equal(a.marketplace_enabled, true);
  assert.ok(a.indexed_at);
  assert.equal(b.dao_id, 'CTOK2');
  assert.equal(b.status, 'pending');
  assert.equal(b.auction_enabled, null);
  assert.equal(b.auction_paused, null);

  const modulesRows = rows(`SELECT module_role FROM manager.dao_modules WHERE dao_id = 'CTOK1' ORDER BY module_role`);
  assert.deepEqual(modulesRows.map((r) => r.module_role), ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury']);
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.event_identity`).n, 12);

  const impls = rows(`SELECT wasm_hash, name, revoked, revoked_at FROM manager.implementations ORDER BY wasm_hash`);
  assert.deepEqual(impls, [
    { wasm_hash: 'aa', name: 'token', revoked: false, revoked_at: null },
    { wasm_hash: 'bb', name: 'auction', revoked: true, revoked_at: 9 }
  ]);
  assert.equal(one(`SELECT token_impl, marketplace_impl FROM manager.current_implementations`).token_impl, 'aa');
});

test('token: ownership, mints, members and voting power', { skip }, () => {
  const inventory = rows(`SELECT token_id, owner FROM token.inventory WHERE dao_id = 'CTOK1' ORDER BY token_id`);
  assert.equal(inventory.length, 6, 'a mint is counted once although it emits mint and mint_with_minter');
  assert.equal(inventory[0].owner, 'GBOB', 'transfer moves token 1');
  assert.ok(inventory.slice(1).every((r) => r.owner === 'GALICE'));
  assert.equal(one(`SELECT count(*)::int AS n FROM token.mints WHERE minter = 'CMINTER'`).n, 6);
  assert.equal(one(`SELECT count(*)::int AS n FROM token.transfers WHERE transfer_type = 'transfer'`).n, 1);

  const members = rows(`SELECT address, owned_token_count, voting_power, delegated_to FROM token.members ORDER BY address`);
  assert.deepEqual(members, [
    { address: 'GALICE', owned_token_count: 5, voting_power: 5, delegated_to: null },
    { address: 'GBOB', owned_token_count: 1, voting_power: 1, delegated_to: 'GBOB' },
    { address: 'GDAVE', owned_token_count: 0, voting_power: 12, delegated_to: null }
  ]);
  assert.deepEqual(rows(`SELECT authority, enabled FROM token.mint_authorities`), [{ authority: 'CMINTER', enabled: true }]);
});

test('governance: proposals, votes, lifecycle and authorities', { skip }, () => {
  const proposals = rows(`SELECT proposal_number, proposal_id, proposer, state, eta_seconds, snapshot_ledger, vote_end_seconds, action_count, for_votes, against_votes, abstain_votes FROM app.proposal_list WHERE dao_id = 'CTOK1' ORDER BY proposal_number`);
  assert.deepEqual(proposals.map((p) => [p.proposal_number, p.proposal_id, p.state]), [[1, 'p1', 'executed'], [2, 'p2', 'pending'], [3, 'p3', 'canceled']]);
  const [p1] = proposals;
  assert.equal(p1.proposer, 'GALICE');
  assert.equal(p1.snapshot_ledger, 139);
  assert.equal(p1.vote_end_seconds, 1790000000);
  assert.equal(p1.action_count, 2);
  assert.equal(p1.eta_seconds, 1790000100, 'an executed proposal keeps the eta recorded when it was queued');
  assert.deepEqual([p1.for_votes, p1.against_votes, p1.abstain_votes].map(Number), [5, 1, 2]);

  const detail = one(`SELECT actions, votes FROM app.proposal_detail WHERE proposal_id = 'p1'`);
  assert.deepEqual(detail.actions.map((a) => [a.action_index, a.target, a.function]), [[0, 'CTRE1', 'transfer'], [1, 'CTOK1', 'mint']]);
  assert.deepEqual(detail.actions[0].args, ['GBOB', '5']);
  assert.deepEqual(detail.votes.map((v) => [v.voter, v.support, Number(v.weight)]), [['GALICE', 1, 5], ['GBOB', 0, 1], ['GCAROL', 2, 2]]);

  assert.deepEqual(
    rows(`SELECT authority, source FROM governance.governor_authorities WHERE dao_id = 'CTOK1' ORDER BY authority`),
    [{ authority: 'CTRE1', source: 'owner' }, { authority: 'GAUTH', source: 'event' }]
  );
  assert.deepEqual(rows(`SELECT governor, target, function FROM treasury.calls`), [{ governor: 'CGOV1', target: 'CTOK1', function: 'mint' }]);
});

test('auction: bids, refunds, settlements and per-auction configuration', { skip }, () => {
  const auctions = rows(`SELECT token_id, duration_seconds, time_buffer_seconds, reserve_price, settled, cancelled FROM auction.auctions ORDER BY token_id`);
  assert.deepEqual(auctions.map((a) => [a.token_id, a.duration_seconds, a.settled, a.cancelled]), [
    [7, 86400, true, false],
    [8, 7200, false, true],
    [9, 7200, true, false]
  ]);
  assert.equal(auctions[0].time_buffer_seconds, 300);
  assert.equal(Number(auctions[0].reserve_price), 10);
  assert.deepEqual(rows(`SELECT bidder, amount, extended FROM auction.bids ORDER BY event_ledger`).map((b) => [b.bidder, Number(b.amount), b.extended]), [['GBID1', 20, false], ['GBID2', 30, true]]);
  assert.equal(one(`SELECT bidder FROM auction.bid_refunds`).bidder, 'GBID1');
  assert.deepEqual(rows(`SELECT token_id, winner FROM auction.settlements ORDER BY token_id`), [{ token_id: 7, winner: 'GBID2' }, { token_id: 9, winner: null }]);
});

test('metadata: properties reset, seeds and configuration overlay', { skip }, () => {
  assert.deepEqual(rows(`SELECT property_id, name FROM metadata.properties`), [{ property_id: 0, name: 'bg2' }]);
  assert.deepEqual(one(`SELECT token_id, num_properties, selections FROM metadata.token_seeds`), { token_id: 3, num_properties: 1, selections: [2] });
  const config = one(`SELECT * FROM metadata.configuration`);
  assert.equal(config.dao_id, 'CTOK1');
  assert.equal(config.token_contract, 'CTOK1');
  assert.equal(config.renderer_base, 'https://r/');
  assert.equal(config.project_uri, 'ipfs://p0');
  assert.equal(config.description, 'Alpha DAO v2');
  assert.equal(config.contract_image, 'img1');
  assert.equal(config.owner, 'GOWNER');
});

test('marketplace: listing status follows purchase, cancel and open', { skip }, () => {
  assert.deepEqual(
    rows(`SELECT token_id, listing_type, status, buyer FROM marketplace.listings ORDER BY token_id`),
    [
      { token_id: 9, listing_type: 'primary', status: 'purchased', buyer: 'GBUYER' },
      { token_id: 10, listing_type: 'secondary', status: 'cancelled', buyer: null },
      { token_id: 11, listing_type: 'secondary', status: 'open', buyer: null }
    ]
  );
  assert.equal(Number(one(`SELECT fee FROM marketplace.purchases`).fee), 2);
});

test('minter: claims resolve to the DAO by token_id and foreign tokens are dropped', { skip }, () => {
  assert.deepEqual(rows(`SELECT dao_id, token_id, recipient, amount FROM minter.merkle_claim_events`).map((r) => [r.dao_id, r.token_id, r.recipient, Number(r.amount)]), [['CTOK1', 'CTOK1', 'GALICE', 3]]);
  assert.deepEqual(rows(`SELECT dao_id, recipient, amount FROM minter.allowlist_claim_events`).map((r) => [r.dao_id, r.recipient, Number(r.amount)]), [['CTOK1', 'GBOB', 2]]);
  assert.deepEqual(one(`SELECT dao_id, recipient_count, total_amount, first_token_id FROM minter.batch_mint_events`), { dao_id: 'CTOK1', recipient_count: 4, total_amount: 8, first_token_id: 7 });
  assert.deepEqual(rows(`SELECT allocation_type, member_count FROM minter.allocation_updates ORDER BY ledger_sequence`), [
    { allocation_type: 'merkle', member_count: null },
    { allocation_type: 'allowlist', member_count: 4 }
  ]);
});

test('activity feed: tenant resolution and kinds', { skip }, () => {
  const feed = (where) => rows(`SELECT * FROM app.activity_feed WHERE ${where} ORDER BY ledger_sequence, event_index`);
  assert.ok(feed(`contract_role = 'manager'`).every((r) => r.dao_id === null), 'manager events are deployment-wide');
  assert.ok(feed(`contract_role = 'governor'`).every((r) => r.dao_id === 'CTOK1'));
  assert.ok(feed(`contract_role = 'minter'`).every((r) => r.dao_id === 'CTOK1'));
  assert.equal(feed(`contract_role = 'minter'`).length, 5, 'the foreign-token claim is not visible to any DAO');
  assert.equal(one(`SELECT count(*)::int AS n FROM app.activity_feed_events WHERE contract_role = 'minter'`).n, 6);

  const kinds = rows(`SELECT kind, count(*)::int AS n FROM app.activity_feed WHERE contract_role = 'minter' GROUP BY kind ORDER BY kind`);
  assert.deepEqual(kinds.map((k) => k.kind), ['minter.allowlist_claim', 'minter.allowlist_set', 'minter.batch_mint', 'minter.merkle_claim', 'minter.merkle_root_set']);
  const merkle = one(`SELECT actor, amount, token_id, summary FROM app.activity_feed WHERE kind = 'minter.merkle_claim'`);
  assert.deepEqual([merkle.actor, merkle.amount, merkle.token_id], ['GALICE', '3', 'CTOK1']);
  assert.equal(one(`SELECT amount FROM app.activity_feed WHERE kind = 'minter.batch_mint'`).amount, '8');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'proposal_cancelled'`).kind, 'governance.proposal_cancelled');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'listing_purchased'`).kind, 'marketplace.listing_purchased');
  assert.deepEqual(rows(`SELECT DISTINCT kind FROM app.activity_feed WHERE kind LIKE 'contract.%'`), [{ kind: 'contract.unpaused' }]);
});

test('indexer status exposes progress without raw events', { skip }, () => {
  const status = one(`SELECT * FROM app.indexer_status`);
  assert.equal(status.deployment_id, DEPLOYMENT);
  assert.equal(status.latest_ledger, 195);
  assert.equal(status.event_count, events.length);
});

// ---------------------------------------------------------------------------
// Pipeline <-> database <-> Prisma alignment
// ---------------------------------------------------------------------------
const PIPELINE_TYPES = { string: ['text'], int64: ['bigint'], boolean: ['boolean'] };

test('pipeline sink schemas match the landing table columns', { skip }, () => {
  const yaml = readFileSync(new URL('../pipelines/builder-stellar-events.yaml', import.meta.url), 'utf8');
  for (const [transform, schema, table] of [['raw_events', 'chain', 'raw_events'], ['decoded_events', 'chain', 'decoded_events'], ['activity_feed', 'app', 'activity_feed_events']]) {
    const block = yaml.split(/\n  (?=\w+:\n    type: script)/).find((b) => b.startsWith(`${transform}:`));
    assert.ok(block, `transform ${transform} found in the generated pipeline`);
    const fields = [...block.match(/    schema:\n((?:      \w+: \w+\n)+)/)[1].matchAll(/      (\w+): (\w+)/g)];
    const columns = Object.fromEntries(rows(`SELECT column_name AS c, data_type AS t FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${table}'`).map((r) => [r.c, r.t]));
    for (const [, name, type] of fields) {
      assert.ok(name in columns, `${schema}.${table} is missing pipeline column ${name}`);
      assert.ok(PIPELINE_TYPES[type].includes(columns[name]), `${schema}.${table}.${name}: pipeline ${type} vs database ${columns[name]}`);
    }
    const required = rows(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${table}' AND is_nullable='NO' AND column_default IS NULL`).map((r) => r.c);
    for (const column of required) assert.ok(fields.some(([, name]) => name === column), `${schema}.${table}.${column} is NOT NULL without default but the pipeline does not write it`);
  }
});

const PRISMA_TYPES = {
  String: ['text', 'character varying'],
  Int: ['integer'],
  BigInt: ['bigint'],
  Decimal: ['numeric'],
  Boolean: ['boolean'],
  DateTime: ['timestamp with time zone', 'timestamp without time zone'],
  Json: ['jsonb', 'json']
};

test('prisma schema matches the database views column for column', { skip }, () => {
  const source = readFileSync(new URL('../../../apps/web/prisma/schema.prisma', import.meta.url), 'utf8');
  const views = [...source.matchAll(/^view (\w+) \{\n([\s\S]*?)\n\}/gm)];
  assert.ok(views.length > 10);
  for (const [, model, body] of views) {
    const view = body.match(/@@map\("(\w+)"\)/)[1];
    const schema = body.match(/@@schema\("(\w+)"\)/)[1];
    const columns = Object.fromEntries(rows(`SELECT column_name AS c, data_type AS t FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='${view}'`).map((r) => [r.c, r.t]));
    assert.ok(Object.keys(columns).length > 0, `${model}: view ${schema}.${view} does not exist`);
    for (const line of body.split('\n')) {
      const field = line.match(/^\s+(\w+)\s+(String|Int|BigInt|Decimal|Boolean|DateTime|Json)\??\s*(?:@map\("(\w+)"\))?/);
      if (!field) continue;
      const column = field[3] ?? field[1];
      assert.ok(column in columns, `${model}.${field[1]}: ${schema}.${view} has no column ${column}`);
      assert.ok(PRISMA_TYPES[field[2]].includes(columns[column]), `${model}.${field[1]}: prisma ${field[2]} vs database ${columns[column]}`);
    }
  }
});
