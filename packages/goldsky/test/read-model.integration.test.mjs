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
import { allEvents, contractEventsByContract } from '../src/contract-events.mjs';

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
const wasmHashes = (n) => dataMap(Object.fromEntries(['token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace'].map((k, i) => [k, bytes(`a${i}${n}`)])));
const modules = (n) => dataMap(Object.fromEntries(Object.entries(dao(n)).map(([k, v]) => [k, addr(v)])));

const events = [];
const emitted = new Map(); // `${role}:${event name}` -> { topics, data } as used by the fixtures
function emit(role, contract, name, { topics = [], data = {}, ledger, tx = 0, evt = 0 }) {
  emitted.set(`${role}:${name}`, { topics: topics.length, data: Object.keys(data) });
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
    // The pipeline writes ledger_closed_at as epoch milliseconds (e.g. "1791475282000"), not ISO text.
    ledger_closed_at: String(Date.UTC(2026, 9, 1) + ledger * 5000),
    _gs_op: 'i'
  });
}

function buildScenario() {
  const d1 = dao(1);
  const MINTER = 'CMINTER';

  // --- manager ---------------------------------------------------------------
  emit('manager', 'CMANAGER', 'manager_initialized', { topics: [addr('GADMIN')], data: { version: str('0.1.0'), deployed_ledger: u64(1) }, ledger: 100 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('aa')], data: { name: str('token'), version: str('0.1.0'), published_ledger: u64(5) }, ledger: 101 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('bb')], data: { name: str('auction'), version: str('0.1.0'), published_ledger: u64(6) }, ledger: 101, evt: 1 });
  emit('manager', 'CMANAGER', 'latest_implementation_set', { topics: [str('token'), bytes('aa')], data: { version: str('0.1.0') }, ledger: 101, evt: 2 });
  emit('manager', 'CMANAGER', 'implementation_revoked', { topics: [bytes('bb')], data: { revoked_ledger: u64(9) }, ledger: 102 });
  emit('manager', 'CMANAGER', 'current_implementations_updated', {
    data: { token: bytes('aa'), metadata: bytes('cc'), auction: bytes('dd'), governor: bytes('ee'), treasury: bytes('ff'), marketplace: bytes('11') }, ledger: 103
  });
  emit('manager', 'CMANAGER', 'dao_created', { topics: [addr('CTOK1'), addr('GDEPLOYER'), addr('GLAUNCH')], data: { created_ledger: u64(110), modules: modules(1), wasm_hashes: wasmHashes(1), slug: str('dao-one') }, ledger: 110 });
  // A second pending DAO first requests the same slug (allowed: nothing is claimed
  // until launch), then renames its request.
  emit('manager', 'CMANAGER', 'dao_created', { topics: [addr('CTOK2'), addr('GDEPLOYER2'), addr('GLAUNCH2')], data: { created_ledger: u64(111), modules: modules(2), wasm_hashes: wasmHashes(2), slug: str('dao-one') }, ledger: 111 });
  emit('manager', 'CMANAGER', 'pending_slug_updated', { topics: [addr('CTOK2')], data: { slug: str('dao-two') }, ledger: 111, evt: 1 });
  emit('token', d1.token, 'token_initialized', { topics: [addr('GOWNER')], data: { uri: str('ipfs://alpha'), name: str('Alpha'), symbol: str('ALP'), version: str('0.1.0') }, ledger: 112 });
  emit('metadata', d1.metadata, 'metadata_initialized', {
    topics: [addr(d1.token)],
    data: { renderer_base: str('https://r/'), version: str('0.1.0'), admin: addr('GOWNER'), project_uri: str('ipfs://p0'), description: str('Alpha DAO'), contract_image: str('img0') },
    ledger: 113
  });
  emit('auction', d1.auction, 'auction_initialized', {
    topics: [addr('GOWNER')],
    data: { token_contract: addr(d1.token), treasury: addr(d1.treasury), duration: u64(86400), reserve_price: i128(10), min_bid_increment_percent: u32(5), time_buffer: u64(300), payment_token: addr('CXLM'), version: str('0.1.0') },
    ledger: 114
  });
  emit('manager', 'CMANAGER', 'dao_launched', {
    topics: [addr('CTOK1')],
    data: { launched_ledger: u64(116), modules: modules(1), launch_auction: bool(false), launch_marketplace: bool(true), enable_minter: bool(true) }, ledger: 116
  });
  // Every module emits its own `<module>_launched` event (topic treasury) and hands
  // its admin from the launch admin to the Treasury (admin_changed).
  emit('token', d1.token, 'token_launched', { topics: [addr(d1.treasury)], data: { minters: vec(addr(MINTER)) }, ledger: 116, evt: 1 });
  emit('governor', d1.governor, 'governor_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 2 });
  emit('treasury', d1.treasury, 'treasury_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 3 });
  emit('metadata', d1.metadata, 'metadata_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 4 });
  emit('auction', d1.auction, 'auction_launched', { topics: [addr(d1.treasury)], data: { started: bool(false) }, ledger: 116, evt: 5 });
  emit('marketplace', d1.marketplace, 'marketplace_launched', { topics: [addr(d1.treasury)], data: { opened: bool(true) }, ledger: 116, evt: 6 });
  // Token launch grants each minter (changed_by = manager) in the same transaction.
  emit('token', d1.token, 'mint_authority_changed', { topics: [addr(MINTER)], data: { old_enabled: bool(false), enabled: bool(true), changed_by: addr('CMANAGER') }, ledger: 116, evt: 7 });
  ['token', 'governor', 'treasury', 'metadata', 'auction', 'marketplace'].forEach((role, k) => {
    emit(role, d1[role], 'admin_changed', { topics: [addr('GLAUNCH'), addr(d1.treasury)], ledger: 116, evt: 8 + k });
  });
  emit('manager', 'CMANAGER', 'slug_claimed', { topics: [addr('CTOK1'), str('dao-one')], ledger: 116, evt: 14 });
  emit('manager', 'CMANAGER', 'admin_proposed', { topics: [addr('GADMIN'), addr('GADMIN2')], ledger: 104 });
  emit('manager', 'CMANAGER', 'admin_changed', { topics: [addr('GADMIN'), addr('GADMIN2')], ledger: 105 });
  // Fixtures for the post-hardening events (assertions on the matching views are reconciled separately).
  emit('manager', 'CMANAGER', 'admin_proposal_cancelled', { topics: [addr('GADMIN2'), addr('GADMIN3')], ledger: 105, evt: 1 });
  emit('auction', d1.auction, 'upgraded', { topics: [bytes('a20'), bytes('b20')], data: { version: str('0.2.0') }, ledger: 117 });
  emit('auction', d1.auction, 'version_synced', { data: { version: str('0.2.1') }, ledger: 118 });
  emit('token', d1.token, 'version_synced', { data: { version: str('0.1.1') }, ledger: 118, evt: 1 });
  emit('auction', d1.auction, 'migrated', { data: { from_storage_version: u32(1), to_storage_version: u32(2) }, ledger: 119 });
  emit('manager', 'CMANAGER', 'platform_minter_set', { topics: [addr(MINTER)], ledger: 106 });
  emit('auction', d1.auction, 'unpaused', { ledger: 130 });

  // --- token: a 6-token batch mint in ONE transaction (13 events, indexes >= 10),
  // each mint bumping GALICE's voting power, then one mint_batch_with_minter for
  // the range. The last event must win even though 'event-9' sorts after
  // 'event-11' as text.
  for (let k = 0; k < 6; k += 1) {
    emit('token', d1.token, 'mint', { topics: [addr('GALICE')], data: { token_id: u32(k + 1) }, ledger: 120, tx: 3, evt: 2 * k });
    emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(k), new_votes: u128(k + 1) }, ledger: 120, tx: 3, evt: 2 * k + 1 });
  }
  emit('token', d1.token, 'mint_batch_with_minter', { topics: [addr(MINTER)], data: { first_token_id: u32(1), count: u32(6) }, ledger: 120, tx: 3, evt: 12 });
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr('GBOB')], data: { token_id: u32(1) }, ledger: 121, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(6), new_votes: u128(5) }, ledger: 121, evt: 1 });
  emit('token', d1.token, 'delegate_changed', { topics: [addr('GBOB')], data: { from_delegate: VOID, to_delegate: addr('GBOB') }, ledger: 121, evt: 2 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GBOB')], data: { previous_votes: u128(0), new_votes: u128(1) }, ledger: 121, evt: 3 });
  // A token moved to the Treasury leaves the voting supply: its holder's delegate
  // loses the vote and the Treasury gains none.
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr(d1.treasury)], data: { token_id: u32(2) }, ledger: 122, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(5), new_votes: u128(4) }, ledger: 122, evt: 1 });

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
  // OpenZeppelin's duplicate quorum event at construction, then one governed update.
  emit('governor', d1.governor, 'quorum_changed', { data: { old_quorum: u128(0), new_quorum: u128(1000) }, ledger: 135, evt: 1 });
  emit('governor', d1.governor, 'voting_period_changed', { topics: [addr(d1.treasury)], data: { old_value: u32(10), new_value: u32(20) }, ledger: 136 });
  // proposal_created + proposal_scheduled (same transaction). States are computed
  // from the clock, so windows are placed far in the past/future or relative to now.
  const created = (id, ledger, { voteStart = 1000000000, voteEnd = 1000000300, quorum = 1 } = {}) => {
    emit('governor', d1.governor, 'proposal_created', {
      topics: [bytes(id), addr('GALICE')],
      data: {
        targets: vec(addr(d1.treasury), addr(d1.token)),
        functions: vec(sym('transfer'), sym('mint')),
        args: vec(vec(addr('GBOB'), i128(5)), vec(addr('GBOB'))),
        vote_snapshot: u32(ledger - 1), vote_end: u32(voteEnd), description: str(JSON.stringify({ title: id }))
      },
      ledger
    });
    emit('governor', d1.governor, 'proposal_scheduled', {
      topics: [bytes(id)],
      data: { vote_start: u64(voteStart), vote_end: u64(voteEnd), snapshot_ledger: u32(ledger - 1), quorum_votes: u128(quorum) },
      ledger, evt: 5
    });
  };
  const nowSeconds = Math.floor(Date.now() / 1000);
  created('p1', 140, { voteEnd: 1790000000 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GALICE'), bytes('p1')], data: { vote_type: u32(1), weight: u128(5), reason: str('yes') }, ledger: 141 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GBOB'), bytes('p1')], data: { vote_type: u32(0), weight: u128(1), reason: str('') }, ledger: 142 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GCAROL'), bytes('p1')], data: { vote_type: u32(2), weight: u128(2), reason: str('') }, ledger: 142, evt: 1 });
  emit('governor', d1.governor, 'proposal_queued', { topics: [bytes('p1')], data: { eta: u64(1790000100) }, ledger: 143 });
  emit('governor', d1.governor, 'proposal_executed', { topics: [bytes('p1')], ledger: 144 });
  // Treasury.execute emits one Execute per call (topics governor, target, proposal_id; data function, index).
  emit('treasury', d1.treasury, 'execute', { topics: [addr(d1.governor), addr(d1.treasury), bytes('p1')], data: { function: sym('transfer'), index: u32(0) }, ledger: 144, evt: 1 });
  emit('treasury', d1.treasury, 'execute', { topics: [addr(d1.governor), addr(d1.token), bytes('p1')], data: { function: sym('mint'), index: u32(1) }, ledger: 144, evt: 2 });
  // Voting open now -> active.
  created('p2', 145, { voteStart: nowSeconds - 600, voteEnd: 2000000000 });
  created('p3', 146);
  emit('governor', d1.governor, 'proposal_cancelled', { topics: [bytes('p3')], ledger: 147 });
  // Never queued, quorum met and for > against, 14 days past vote_end -> expired.
  created('p4', 148, { quorum: 3 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GALICE'), bytes('p4')], data: { vote_type: u32(1), weight: u128(5), reason: str('') }, ledger: 148, evt: 1 });
  // Queued with an eta more than 14 days ago -> expired.
  created('p5', 149);
  emit('governor', d1.governor, 'proposal_queued', { topics: [bytes('p5')], data: { eta: u64(1000000100) }, ledger: 149, evt: 1 });
  // Majority but quorum missed -> defeated (terminal, never expired).
  created('p6', 155, { quorum: 100 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GALICE'), bytes('p6')], data: { vote_type: u32(1), weight: u128(5), reason: str('') }, ledger: 155, evt: 1 });
  // Quorum met (abstain counts toward quorum) with a majority, ended an hour ago -> succeeded.
  created('p7', 156, { voteStart: nowSeconds - 7200, voteEnd: nowSeconds - 3600, quorum: 6 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GALICE'), bytes('p7')], data: { vote_type: u32(1), weight: u128(5), reason: str('') }, ledger: 156, evt: 1 });
  emit('governor', d1.governor, 'vote_cast', { topics: [addr('GCAROL'), bytes('p7')], data: { vote_type: u32(2), weight: u128(2), reason: str('') }, ledger: 156, evt: 2 });
  // Voting has not started -> pending.
  created('p8', 157, { voteStart: 2000000000, voteEnd: 2000000300 });

  // --- auction -----------------------------------------------------------------
  const auctionCreated = (id, ledger) => emit('auction', d1.auction, 'auction_created', {
    topics: [u128(id)], data: { start_time: u64(1000), end_time: u64(2000), reserve_price: i128(10), payment_token: addr('CXLM') }, ledger
  });
  auctionCreated(7, 150);
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID1')], data: { amount: i128(20), extended: bool(false), new_end_time: u64(2000) }, ledger: 151 });
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID2')], data: { amount: i128(30), extended: bool(true), new_end_time: u64(2300) }, ledger: 152 });
  emit('auction', d1.auction, 'bid_refunded', { topics: [u128(7), addr('GBID1')], data: { amount: i128(20) }, ledger: 152, evt: 1 });
  // A refund whose push failed is credited, then pulled by the bidder.
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID3')], data: { amount: i128(40), extended: bool(false), new_end_time: u64(2300) }, ledger: 153 });
  emit('auction', d1.auction, 'refund_deferred', { topics: [u128(7), addr('GBID2')], data: { amount: i128(30) }, ledger: 153, evt: 1 });
  emit('auction', d1.auction, 'refund_withdrawn', { topics: [addr('GBID2')], data: { amount: i128(30) }, ledger: 154 });
  emit('auction', d1.auction, 'auction_settled', { topics: [u128(7)], data: { winner: addr('GBID2'), amount: i128(30) }, ledger: 160 });
  emit('auction', d1.auction, 'duration_updated', { data: { duration: u64(7200), changed_by: addr('GOWNER') }, ledger: 161 });
  auctionCreated(8, 162);
  emit('auction', d1.auction, 'auction_cancelled', { topics: [u128(8)], data: { reason: u32(1), cancelled_by: addr('GOWNER') }, ledger: 163 });
  auctionCreated(9, 164);
  emit('auction', d1.auction, 'auction_settled', { topics: [u128(9)], data: { winner: VOID, amount: i128(0) }, ledger: 165 });
  // An outstanding deferred refund (never withdrawn) stays in pending_refunds.
  emit('auction', d1.auction, 'refund_deferred', { topics: [u128(9), addr('GBID4')], data: { amount: i128(7) }, ledger: 166 });

  // --- metadata ----------------------------------------------------------------
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(0)], data: { name: str('bg') }, ledger: 170 });
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(1)], data: { name: str('body') }, ledger: 171 });
  emit('metadata', d1.metadata, 'properties_reset', { data: { old_num_properties: u32(0) }, ledger: 172 });
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(0)], data: { name: str('bg2') }, ledger: 173 });
  emit('metadata', d1.metadata, 'seed_generated', { topics: [u32(3)], data: { num_properties: u32(1), selections: vec(u32(2)) }, ledger: 173, evt: 1 });
  // A batch seeds tokens 4 and 5 in one event; a later seed for 5 becomes current.
  emit('metadata', d1.metadata, 'seeds_generated', { topics: [u32(4)], data: { count: u32(2), num_properties: u32(1), selections: vec(vec(u32(1), u32(0)), vec(u32(1), u32(1))) }, ledger: 173, evt: 2 });
  emit('metadata', d1.metadata, 'seed_generated', { topics: [u32(5)], data: { num_properties: u32(1), selections: vec(u32(1), u32(0)) }, ledger: 176 });
  emit('metadata', d1.metadata, 'description_updated', { data: { old_description: str('Alpha DAO'), new_description: str('Alpha DAO v2') }, ledger: 174 });
  emit('metadata', d1.metadata, 'contract_image_updated', { data: { old_image: str('img0'), new_image: str('img1') }, ledger: 175 });

  // --- marketplace -------------------------------------------------------------
  // Primary listings are keyed by listing_id (u64 topic); the token is minted to the buyer on purchase.
  const primary = (id, ledger) => emit('marketplace', d1.marketplace, 'primary_listing_created', {
    topics: [u64(id)], data: { price: i128(100), expires_at: u64(5000), payment_asset: addr('CXLM') }, ledger
  });
  primary(1, 180);
  emit('marketplace', d1.marketplace, 'primary_listing_purchased', {
    topics: [u64(1), addr('GBUYER')], data: { token_id: u32(9), price: i128(100), payment_asset: addr('CXLM') }, ledger: 181
  });
  primary(2, 187);
  emit('marketplace', d1.marketplace, 'primary_listing_cancelled', { topics: [u64(2)], ledger: 188 });
  primary(3, 189);
  emit('marketplace', d1.marketplace, 'primary_listing_expired', { topics: [u64(3)], ledger: 189, evt: 1 });
  const secondary = (id, ledger) => emit('marketplace', d1.marketplace, 'secondary_listing_created', {
    topics: [u32(id)], data: { seller: addr('GSELLER'), price: i128(100), expires_at: u64(5000), fee_bps: u32(250), payment_asset: addr('CXLM') }, ledger
  });
  secondary(10, 182);
  emit('marketplace', d1.marketplace, 'listing_cancelled', { topics: [u32(10)], data: { seller: addr('GSELLER') }, ledger: 183 });
  secondary(11, 184);
  secondary(12, 185);
  emit('marketplace', d1.marketplace, 'listing_purchased', {
    topics: [u32(12), addr('GBUYER')], data: { seller: addr('GSELLER'), price: i128(100), fee: i128(2), payment_asset: addr('CXLM') }, ledger: 186
  });

  // --- minter (shared contract; tenant = token_id topic) --------------------------
  const claim = (name, token, who, amount, ledger) => emit('minter', MINTER, name, { topics: [addr(token), addr(who)], data: { amount: u128(amount) }, ledger });
  claim('merkle_claim_event', 'CTOK1', 'GALICE', 3, 190);
  claim('allowlist_claim_event', 'CTOK1', 'GBOB', 2, 191);
  claim('merkle_claim_event', 'CTOKFOREIGN', 'GMALLORY', 99, 192);
  emit('minter', MINTER, 'mint_batch_event', { topics: [addr('CTOK1')], data: { recipient_count: u32(4), total_amount: u128(8), first_token_id: u32(7) }, ledger: 193 });
  emit('minter', MINTER, 'merkle_root_set_event', { topics: [addr('CTOK1')], ledger: 194 });
  emit('minter', MINTER, 'allowlist_set_event', { topics: [addr('CTOK1')], data: { member_count: u32(4) }, ledger: 195 });
}

// Event ids must be unique (raw_events_pkey); fail loudly in the fixture, not in Postgres.
function assertUniqueEventIds() {
  const seen = new Set();
  for (const e of events) {
    assert.ok(!seen.has(e.event_id), `duplicate fixture event id ${e.event_id}`);
    seen.add(e.event_id);
  }
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
  const byContract = contractEventsByContract();
  const drift = [];
  for (const [key, used] of emitted) {
    const [role, name] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
    // Same-named events (Launched) are looked up by (contract, name); library events by name.
    const expected = byContract[`${role}:${canonical(name)}`] ?? truth[canonical(name)];
    if (!expected) { drift.push(`${name}: not a contract or library event`); continue; }
    if (used.topics !== expected.topics.length) drift.push(`${name}: fixture has ${used.topics} topics, contract ${expected.topics.length}`);
    if (JSON.stringify([...used.data].sort()) !== JSON.stringify([...expected.data].sort())) {
      drift.push(`${name}: fixture data [${used.data}] vs contract [${expected.data}]`);
    }
  }
  assert.deepEqual(drift, []);
  assertUniqueEventIds();
  events.length = 0;
});

test('chain.ledger_closed_at_ts reads epoch milliseconds, epoch seconds, ISO text and empty values', { skip }, () => {
  // The pipeline writes epoch milliseconds; views depend on this helper for every closed-at timestamp.
  const got = rows(`SELECT
      extract(epoch FROM chain.ledger_closed_at_ts('1791475282000'))::bigint AS ms,
      extract(epoch FROM chain.ledger_closed_at_ts('1791475282'))::bigint AS seconds,
      extract(epoch FROM chain.ledger_closed_at_ts('2026-10-01 00:00:05+00'))::bigint AS iso,
      chain.ledger_closed_at_ts('') IS NULL AS empty_is_null,
      chain.ledger_closed_at_ts(NULL) IS NULL AS null_is_null`)[0];
  assert.equal(Number(got.ms), 1791475282);
  assert.equal(Number(got.seconds), 1791475282);
  assert.equal(Number(got.iso), Date.UTC(2026, 9, 1, 0, 0, 5) / 1000);
  assert.equal(got.empty_is_null, true);
  assert.equal(got.null_is_null, true);
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
  const row = one(`SELECT operation_index, event_index FROM chain.decoded_events WHERE event_id = '${DEPLOYMENT}:120-tx120-3-op-0-event-12'`);
  assert.deepEqual(row, { operation_index: 0, event_index: 12 });
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
  assert.equal(a.slug, 'dao-one');
  assert.equal(a.slug_claimed, true);
  assert.equal(b.slug, 'dao-two', 'a pending DAO shows its latest requested slug');
  assert.equal(b.slug_claimed, false);
  assert.deepEqual(
    rows(`SELECT dao_id, requested_slug, claimed_slug, claimed_ledger FROM manager.dao_slugs ORDER BY dao_id`),
    [
      { dao_id: 'CTOK1', requested_slug: 'dao-one', claimed_slug: 'dao-one', claimed_ledger: 116 },
      { dao_id: 'CTOK2', requested_slug: 'dao-two', claimed_slug: null, claimed_ledger: null }
    ]
  );
  assert.equal(one(`SELECT created_slug FROM manager.dao_registry WHERE dao_id = 'CTOK2'`).created_slug, 'dao-one');
  assert.deepEqual(
    [a.token_contract, a.governor_contract, a.auction_contract, a.treasury_contract, a.metadata_contract, a.marketplace_contract],
    ['CTOK1', 'CGOV1', 'CAUC1', 'CTRE1', 'CMETA1', 'CMKT1']
  );
  assert.equal(a.token_name, 'Alpha');
  assert.equal(a.token_symbol, 'ALP');
  assert.equal(a.token_uri, 'ipfs://alpha');
  assert.equal(a.admin_address, 'CTRE1', 'the current admin: the Treasury after the launch handoff');
  assert.equal(one(`SELECT admin_address FROM manager.daos WHERE dao_id = 'CTOK2'`).admin_address, 'GLAUNCH2', 'a pending DAO keeps its launch admin');
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

  const impls = rows(`SELECT wasm_hash, name, published_ledger, revoked, revoked_ledger FROM manager.implementations ORDER BY wasm_hash`);
  assert.deepEqual(impls, [
    { wasm_hash: 'aa', name: 'token', published_ledger: 5, revoked: false, revoked_ledger: null },
    { wasm_hash: 'bb', name: 'auction', published_ledger: 6, revoked: true, revoked_ledger: 9 }
  ]);
  assert.deepEqual(rows(`SELECT name, wasm_hash, version FROM manager.latest_implementations`), [{ name: 'token', wasm_hash: 'aa', version: '0.1.0' }]);
  assert.equal(one(`SELECT token_impl, marketplace_impl FROM manager.current_implementations`).token_impl, 'aa');
});

test('token: ownership, mints, members and voting power', { skip }, () => {
  const inventory = rows(`SELECT token_id, owner FROM token.inventory WHERE dao_id = 'CTOK1' ORDER BY token_id`);
  assert.equal(inventory.length, 6, 'a mint is counted once although a minter event accompanies it');
  assert.equal(inventory[0].owner, 'GBOB', 'transfer moves token 1');
  assert.equal(inventory[1].owner, 'CTRE1', 'token 2 was moved to the treasury');
  assert.ok(inventory.slice(2).every((r) => r.owner === 'GALICE'));
  // The batch event expands to one row per token, with each token's recipient.
  assert.deepEqual(
    rows(`SELECT token_id, minter, recipient FROM token.mints WHERE dao_id = 'CTOK1' ORDER BY token_id`).map((r) => [r.token_id, r.minter, r.recipient]),
    [1, 2, 3, 4, 5, 6].map((id) => [id, 'CMINTER', 'GALICE'])
  );
  assert.equal(new Set(rows(`SELECT event_id FROM token.mints`).map((r) => r.event_id)).size, 6, 'batch rows take each mint event id');
  assert.equal(one(`SELECT count(*)::int AS n FROM token.transfers WHERE transfer_type = 'transfer'`).n, 2);

  const members = rows(`SELECT address, owned_token_count, voting_power, delegated_to FROM token.members ORDER BY address`);
  assert.deepEqual(members, [
    { address: 'CTRE1', owned_token_count: 1, voting_power: 0, delegated_to: null },
    { address: 'GALICE', owned_token_count: 4, voting_power: 4, delegated_to: null },
    { address: 'GBOB', owned_token_count: 1, voting_power: 1, delegated_to: 'GBOB' },
    { address: 'GDAVE', owned_token_count: 0, voting_power: 12, delegated_to: null }
  ]);
  assert.deepEqual(
    one(`SELECT minted_supply, system_held_supply, voting_supply FROM token.supply WHERE dao_id = 'CTOK1'`),
    { minted_supply: 6, system_held_supply: 1, voting_supply: 5 }
  );
  assert.deepEqual(
    one(`SELECT minted_supply, system_held_supply, voting_supply FROM token.supply WHERE dao_id = 'CTOK2'`),
    { minted_supply: 0, system_held_supply: 0, voting_supply: 0 }
  );
  assert.deepEqual(rows(`SELECT authority, enabled FROM token.mint_authorities`), [{ authority: 'CMINTER', enabled: true }]);
});

test('governance: proposals, votes, lifecycle and authorities', { skip }, () => {
  assert.deepEqual(
    one(`SELECT dao_id, admin, voting_delay_seconds, voting_period_seconds, queue_delay_seconds, proposal_threshold, quorum_bps, version FROM governance.settings`),
    { dao_id: 'CTOK1', admin: 'CTRE1', voting_delay_seconds: 1, voting_period_seconds: 20, queue_delay_seconds: 1, proposal_threshold: 1, quorum_bps: 1000, version: '0.1.0' },
    'constructor values overlaid with the latest setter events'
  );
  assert.equal(one(`SELECT kind, summary FROM app.activity_feed WHERE event_name = 'quorum_changed'`).kind, 'governance.quorum_changed');
  const proposals = rows(`SELECT proposal_number, proposal_id, proposer, state, eta_seconds, snapshot_ledger, vote_start_seconds, vote_end_seconds, quorum_votes, action_count, for_votes, against_votes, abstain_votes FROM app.proposal_list WHERE dao_id = 'CTOK1' ORDER BY proposal_number`);
  assert.deepEqual(proposals.map((p) => [p.proposal_number, p.proposal_id, p.state]), [
    [1, 'p1', 'executed'], [2, 'p2', 'active'], [3, 'p3', 'canceled'], [4, 'p4', 'expired'],
    [5, 'p5', 'expired'], [6, 'p6', 'defeated'], [7, 'p7', 'succeeded'], [8, 'p8', 'pending']
  ]);
  assert.equal(proposals[5].quorum_votes, 100);
  assert.equal(proposals[7].vote_start_seconds, 2000000000);
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

  // Treasury.execute emits one Execute per call; both views expose proposal_id and call_index.
  assert.deepEqual(
    rows(`SELECT proposal_id, call_index, governor, target, function FROM treasury.calls ORDER BY call_index`),
    [
      { proposal_id: 'p1', call_index: 0, governor: 'CGOV1', target: 'CTRE1', function: 'transfer' },
      { proposal_id: 'p1', call_index: 1, governor: 'CGOV1', target: 'CTOK1', function: 'mint' }
    ]
  );
  assert.deepEqual(
    rows(`SELECT proposal_id, call_index, target, function FROM governance.proposal_execution_calls ORDER BY call_index`),
    [
      { proposal_id: 'p1', call_index: 0, target: 'CTRE1', function: 'transfer' },
      { proposal_id: 'p1', call_index: 1, target: 'CTOK1', function: 'mint' }
    ]
  );
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
  assert.deepEqual(rows(`SELECT bidder, amount, extended FROM auction.bids ORDER BY event_ledger`).map((b) => [b.bidder, Number(b.amount), b.extended]), [['GBID1', 20, false], ['GBID2', 30, true], ['GBID3', 40, false]]);
  assert.deepEqual(
    rows(`SELECT bidder, refund_status, amount FROM auction.bid_refunds ORDER BY event_ledger, event_index`).map((r) => [r.bidder, r.refund_status, Number(r.amount)]),
    [['GBID1', 'refunded', 20], ['GBID2', 'deferred', 30], ['GBID4', 'deferred', 7]]
  );
  assert.deepEqual(rows(`SELECT bidder, amount FROM auction.refund_withdrawals`).map((r) => [r.bidder, Number(r.amount)]), [['GBID2', 30]]);
  assert.deepEqual(
    rows(`SELECT bidder, deferred_amount, withdrawn_amount, pending_amount FROM auction.pending_refunds`).map((r) => [r.bidder, Number(r.deferred_amount), Number(r.withdrawn_amount), Number(r.pending_amount)]),
    [['GBID4', 7, 0, 7]]
  );
  assert.deepEqual(rows(`SELECT token_id, winner FROM auction.settlements ORDER BY token_id`), [{ token_id: 7, winner: 'GBID2' }, { token_id: 9, winner: null }]);
});

test('metadata: properties reset, seeds and configuration overlay', { skip }, () => {
  assert.deepEqual(rows(`SELECT property_id, name FROM metadata.properties`), [{ property_id: 0, name: 'bg2' }]);
  assert.deepEqual(rows(`SELECT token_id, num_properties, selections FROM metadata.token_seeds WHERE is_current ORDER BY token_id`), [
    { token_id: 3, num_properties: 1, selections: [2] },
    { token_id: 4, num_properties: 1, selections: [1, 0] },
    { token_id: 5, num_properties: 1, selections: [1, 0] }
  ]);
  const config = one(`SELECT * FROM metadata.configuration`);
  assert.equal(config.dao_id, 'CTOK1');
  assert.equal(config.token_contract, 'CTOK1');
  assert.equal(config.renderer_base, 'https://r/');
  assert.equal(config.project_uri, 'ipfs://p0');
  assert.equal(config.description, 'Alpha DAO v2');
  assert.equal(config.contract_image, 'img1');
  assert.equal(config.admin, 'CTRE1', 'the current metadata admin: the treasury after launch');
});

test('marketplace: primary listings by listing_id, secondary by token_id, sales, purchases', { skip }, () => {
  assert.deepEqual(
    rows(`SELECT listing_id, status, token_id, buyer, payment_asset FROM marketplace.primary_listings ORDER BY listing_id`).map((r) => [Number(r.listing_id), r.status, r.token_id, r.buyer, r.payment_asset]),
    [[1, 'purchased', 9, 'GBUYER', 'CXLM'], [2, 'cancelled', null, null, 'CXLM'], [3, 'expired', null, null, 'CXLM']]
  );
  assert.deepEqual(
    rows(`SELECT token_id, status, buyer, seller, payment_asset FROM marketplace.secondary_listings ORDER BY token_id`),
    [
      { token_id: 10, status: 'cancelled', buyer: null, seller: 'GSELLER', payment_asset: 'CXLM' },
      { token_id: 11, status: 'open', buyer: null, seller: 'GSELLER', payment_asset: 'CXLM' },
      { token_id: 12, status: 'purchased', buyer: 'GBUYER', seller: 'GSELLER', payment_asset: 'CXLM' }
    ]
  );
  assert.deepEqual(
    rows(`SELECT sale_type, listing_id, token_id, buyer, seller, price, fee FROM marketplace.sales ORDER BY event_ledger`).map((r) => [r.sale_type, r.listing_id === null ? null : Number(r.listing_id), r.token_id, r.buyer, r.seller, Number(r.price), r.fee === null ? null : Number(r.fee)]),
    [['primary', 1, 9, 'GBUYER', null, 100, null], ['secondary', null, 12, 'GBUYER', 'GSELLER', 100, 2]]
  );
  assert.deepEqual(rows(`SELECT token_id, fee FROM marketplace.purchases`).map((r) => [r.token_id, Number(r.fee)]), [[12, 2]], 'purchases is secondary-only');
});

test('launch lifecycle: per-module launches keyed by emitting contract, admin history, mint grant', { skip }, () => {
  assert.deepEqual(
    rows(`SELECT module_role, module_contract, is_live, treasury, started, opened FROM manager.module_launches WHERE dao_id = 'CTOK1' ORDER BY module_role`),
    ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury'].map((role) => ({
      module_role: role, module_contract: { auction: 'CAUC1', governor: 'CGOV1', marketplace: 'CMKT1', metadata: 'CMETA1', token: 'CTOK1', treasury: 'CTRE1' }[role],
      is_live: true, treasury: 'CTRE1', started: role === 'auction' ? false : null, opened: role === 'marketplace' ? true : null
    }))
  );
  assert.deepEqual(one(`SELECT minters FROM manager.module_launches WHERE dao_id = 'CTOK1' AND module_role = 'token'`).minters, ['CMINTER']);
  const lifecycle = one(`SELECT is_live, launch_auction, launch_marketplace, minter_enabled, auction_started, marketplace_opened FROM manager.dao_lifecycle WHERE dao_id = 'CTOK1'`);
  assert.deepEqual(lifecycle, { is_live: true, launch_auction: false, launch_marketplace: true, minter_enabled: true, auction_started: false, marketplace_opened: true });
  assert.deepEqual(
    rows(`SELECT event_type, previous_admin, new_admin, platform_minter FROM manager.admin_history ORDER BY event_ledger, event_index`),
    [
      { event_type: 'admin_proposed', previous_admin: 'GADMIN', new_admin: 'GADMIN2', platform_minter: null },
      { event_type: 'admin_changed', previous_admin: 'GADMIN', new_admin: 'GADMIN2', platform_minter: null },
      { event_type: 'admin_proposal_cancelled', previous_admin: 'GADMIN2', new_admin: 'GADMIN3', platform_minter: null },
      { event_type: 'platform_minter_set', previous_admin: null, new_admin: null, platform_minter: 'CMINTER' }
    ]
  );
  // Module admin_changed events never leak into the Manager's own admin history.
  assert.deepEqual(
    rows(`SELECT module_role, admin, handed_to_treasury FROM manager.module_admins WHERE dao_id = 'CTOK1' ORDER BY module_role`),
    ['auction', 'governor', 'marketplace', 'metadata', 'token', 'treasury'].map((module_role) => ({ module_role, admin: 'CTRE1', handed_to_treasury: true }))
  );
  assert.deepEqual(
    rows(`SELECT DISTINCT admin, handed_to_treasury FROM manager.module_admins WHERE dao_id = 'CTOK2'`),
    [{ admin: 'GLAUNCH2', handed_to_treasury: false }]
  );
  const settings = one(`SELECT admin, platform_minter, pending_admin FROM manager.settings`);
  assert.equal(settings.pending_admin, null);
  assert.equal(settings.admin, 'GADMIN2');
  assert.equal(settings.platform_minter, 'CMINTER');
  assert.deepEqual(rows(`SELECT authority, launch_grant, changed_by FROM token.mint_authority_history`), [{ authority: 'CMINTER', launch_grant: true, changed_by: 'CMANAGER' }]);
  assert.deepEqual(
    rows(`SELECT token_id, is_current, selections FROM metadata.token_seeds ORDER BY token_id, event_ledger`).map((r) => [r.token_id, r.is_current, r.selections]),
    [[3, true, [2]], [4, true, [1, 0]], [5, false, [1, 1]], [5, true, [1, 0]]]
  );
});

test('module upgrades and wasm hashes: keyed by emitting contract, filtered by deployment and DAO', { skip }, () => {
  assert.deepEqual(
    one(`SELECT token_wasm_hash, governor_wasm_hash, auction_wasm_hash, treasury_wasm_hash, metadata_wasm_hash, marketplace_wasm_hash FROM manager.dao_registry WHERE dao_id = 'CTOK1'`),
    { token_wasm_hash: 'a01', metadata_wasm_hash: 'a11', auction_wasm_hash: 'a21', governor_wasm_hash: 'a31', treasury_wasm_hash: 'a41', marketplace_wasm_hash: 'a51' }
  );
  assert.deepEqual(
    rows(`SELECT dao_id, module_role, contract_id, event_type, from_hash, to_hash, version FROM manager.module_upgrades WHERE deployment_id = '${DEPLOYMENT}' ORDER BY event_seq`),
    [
      { dao_id: 'CTOK1', module_role: 'auction', contract_id: 'CAUC1', event_type: 'upgraded', from_hash: 'a20', to_hash: 'b20', version: '0.2.0' },
      { dao_id: 'CTOK1', module_role: 'auction', contract_id: 'CAUC1', event_type: 'version_synced', from_hash: null, to_hash: null, version: '0.2.1' },
      { dao_id: 'CTOK1', module_role: 'token', contract_id: 'CTOK1', event_type: 'version_synced', from_hash: null, to_hash: null, version: '0.1.1' },
      { dao_id: 'CTOK1', module_role: 'auction', contract_id: 'CAUC1', event_type: 'migrated', from_hash: null, to_hash: null, version: null }
    ]
  );
  assert.deepEqual(
    rows(`SELECT module_role, storage_version FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role IN ('auction', 'token') ORDER BY module_role`),
    [{ module_role: 'auction', storage_version: 2 }, { module_role: 'token', storage_version: 1 }]
  );
  assert.deepEqual(
    one(`SELECT current_hash, current_version, upgrade_count, last_upgraded_from_hash, last_upgraded_ledger FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'auction'`),
    { current_hash: 'b20', current_version: '0.2.1', upgrade_count: 1, last_upgraded_from_hash: 'a20', last_upgraded_ledger: 117 }
  );
  assert.deepEqual(
    one(`SELECT current_hash, current_version, upgrade_count, last_upgraded_from_hash FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'token'`),
    { current_hash: 'a01', current_version: '0.1.1', upgrade_count: 0, last_upgraded_from_hash: null }
  );
  assert.equal(one(`SELECT current_version FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'governor'`).current_version, null);
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.module_versions WHERE dao_id = 'CTOK2'`).n, 6);
  const upgradedFeed = one(`SELECT kind, visibility, summary FROM app.activity_feed WHERE event_name = 'upgraded'`);
  assert.deepEqual(upgradedFeed, { kind: 'auction.upgraded', visibility: 'public', summary: 'Contract upgraded to version 0.2.0 (a20 -> b20)' });
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'admin_proposal_cancelled'`).kind, 'manager.admin_proposal_cancelled');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'migrated'`).kind, 'auction.migrated');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'admin_changed' AND contract_role = 'manager'`).kind, 'manager.admin_changed');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'admin_changed' AND contract_role = 'token'`).kind, 'token.admin_changed');
  assert.equal(one(`SELECT kind, visibility FROM app.activity_feed WHERE event_name = 'slug_claimed'`).visibility, 'public');
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
  assert.deepEqual(rows(`SELECT DISTINCT kind FROM app.activity_feed WHERE kind LIKE 'contract.%'`), [], 'every event has a module- or contract-specific kind');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'unpaused'`).kind, 'auction.unpaused');
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
