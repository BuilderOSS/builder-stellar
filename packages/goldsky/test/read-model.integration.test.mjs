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
import { loadInvoke } from './load-script.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { allEvents, contractEventsByContract } from '../src/contract-events.mjs';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const skip = !DATABASE_URL && 'set TEST_DATABASE_URL to a migrated empty database';

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
const CORE = ['token', 'metadata', 'governor', 'treasury'];
const KINDS = ['auction', 'marketplace', 'claims'];
const NON_VOTING = { auction: true, marketplace: true, claims: false };
// Hash a<i><n> per DaoAddresses key: token 0, metadata 1, auction 2, governor 3, treasury 4, marketplace 5, claims 6.
const HASH_INDEX = { token: 0, metadata: 1, auction: 2, governor: 3, treasury: 4, marketplace: 5, claims: 6 };
const dao = (n) => ({
  token: `CTOK${n}`, metadata: `CMETA${n}`, auction: `CAUC${n}`,
  governor: `CGOV${n}`, treasury: `CTRE${n}`, marketplace: `CMKT${n}`, claims: `CCLM${n}`
});
// DaoCreated's modules / wasm_hashes: the core four plus each kind the DAO has (void otherwise).
const has = (kinds) => (k) => CORE.includes(k) || kinds.includes(k);
const modules = (n, kinds = KINDS) => dataMap(Object.fromEntries([...CORE, ...KINDS].map((k) => [k, has(kinds)(k) ? addr(dao(n)[k]) : VOID])));
const wasmHashes = (n, kinds = KINDS) => dataMap(Object.fromEntries([...CORE, ...KINDS].map((k) => [k, has(kinds)(k) ? bytes(`a${HASH_INDEX[k]}${n}`) : VOID])));
// DaoLaunched.registry: Vec<ModuleEntry { kind, address, non_voting }>.
const registry = (n, kinds = KINDS) => vec(...kinds.map((kind) => dataMap({ address: addr(dao(n)[kind]), kind: sym(kind), non_voting: bool(NON_VOTING[kind]) })));

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

// create_dao: the Token registers each module it was created with (ModuleRegistered) before
// the Manager emits DaoCreated, in the same transaction (contracts/manager/src/contract.rs);
// the registration window starts at the transaction.
function createDao(n, ledger, { deployer, launch, slug, kinds = KINDS }) {
  kinds.forEach((kind, k) => emit('token', `CTOK${n}`, 'module_registered', { topics: [sym(kind)], data: { address: addr(dao(n)[kind]), non_voting: bool(NON_VOTING[kind]) }, ledger, evt: k }));
  emit('manager', 'CMANAGER', 'dao_created', { topics: [addr(`CTOK${n}`), addr(deployer), addr(launch)], data: { created_ledger: u64(ledger), modules: modules(n, kinds), wasm_hashes: wasmHashes(n, kinds), slug: str(slug) }, ledger, evt: 10 });
}

function buildScenario() {
  const d1 = dao(1);
  const d2 = dao(2);

  // --- manager ---------------------------------------------------------------
  emit('manager', 'CMANAGER', 'manager_initialized', { topics: [addr('GADMIN')], data: { version: str('0.1.0'), deployed_ledger: u64(1) }, ledger: 100 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('aa')], data: { name: str('token'), version: str('0.1.0'), published_ledger: u64(5) }, ledger: 101 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('bb')], data: { name: str('auction'), version: str('0.1.0'), published_ledger: u64(6) }, ledger: 101, evt: 1 });
  emit('manager', 'CMANAGER', 'latest_implementation_set', { topics: [str('token'), bytes('aa')], data: { version: str('0.1.0') }, ledger: 101, evt: 2 });
  emit('manager', 'CMANAGER', 'implementation_revoked', { topics: [bytes('bb')], data: { revoked_ledger: u64(9) }, ledger: 102 });
  emit('manager', 'CMANAGER', 'current_implementations_updated', {
    data: { token: bytes('aa'), metadata: bytes('cc'), auction: bytes('dd'), governor: bytes('ee'), treasury: bytes('ff'), marketplace: bytes('11'), claims: bytes('c7') }, ledger: 103
  });
  createDao(1, 110, { deployer: 'GDEPLOYER', launch: 'GLAUNCH', slug: 'dao-one' });
  // A second pending DAO first requests the same slug (allowed: nothing is claimed
  // until launch or an assurance drive), then renames its request.
  createDao(2, 111, { deployer: 'GDEPLOYER2', launch: 'GLAUNCH2', slug: 'dao-one' });
  emit('manager', 'CMANAGER', 'pending_slug_updated', { topics: [addr('CTOK2')], data: { slug: str('dao-two') }, ledger: 111, evt: 11 });
  emit('token', d1.token, 'token_initialized', {
    topics: [addr('GOWNER')],
    data: { name: str('Alpha'), symbol: str('ALP'), settings: dataMap({ transfers_locked: bool(false), members_only_delegation: bool(false), dao_recovery: bool(false) }) },
    ledger: 112
  });
  // DAO 2 runs an assurance drive: open_assurance reserves its slug and opens the paid list; a
  // claimant pays into escrow; the drive fails, the slug is released and the claimant refunded.
  emit('manager', 'CMANAGER', 'assurance_opened', {
    topics: [addr('CTOK2')], data: { claim_minter: addr(d2.claims), list_id: u32(0), deadline: u64(9000), launch_auction: bool(false), launch_marketplace: bool(true) }, ledger: 112, tx: 1
  });
  emit('claims', d2.claims, 'list_opened', {
    topics: [u32(0)], data: { root: bytes('rd'), tree_uri: str('ipfs://drive'), asset: addr('CXLM'), price: i128(25), expires_at: u64(9500), total: u32(4), assurance: dataMap({ threshold_claimers: u32(3), deadline: u64(9000) }) }, ledger: 112, tx: 1, evt: 1
  });
  emit('manager', 'CMANAGER', 'slug_claimed', { topics: [addr('CTOK2'), str('dao-two')], ledger: 112, tx: 1, evt: 2 });
  emit('claims', d2.claims, 'claimed', { topics: [u32(0), addr('GCAROL')], data: { amount: u32(1), first_token_id: u32(0), paid: i128(25), escrowed: bool(true), claimed: u32(1) }, ledger: 113, tx: 1 });
  emit('manager', 'CMANAGER', 'slug_released', { topics: [addr('CTOK2'), str('dao-two')], ledger: 260 });
  emit('claims', d2.claims, 'refunded', { topics: [u32(0), addr('GCAROL')], data: { amount: i128(25) }, ledger: 261 });
  emit('metadata', d1.metadata, 'metadata_initialized', {
    topics: [addr(d1.token)],
    data: { renderer_base: str('https://r/'), admin: addr('GOWNER') },
    ledger: 113
  });
  // The profile is event-only (seq 0 at construction); Metadata stores its hash.
  emit('metadata', d1.metadata, 'profile_updated', {
    topics: [u32(0)], data: { hash: bytes('p0'), profile: str('{"v":1,"description":"Alpha DAO"}') }, ledger: 113, evt: 1
  });
  emit('auction', d1.auction, 'auction_initialized', {
    topics: [addr('GOWNER')],
    data: { token_contract: addr(d1.token), treasury: addr(d1.treasury), duration: u64(86400), reserve_price: i128(10), min_bid_increment_percent: u32(5), time_buffer: u64(300), payment_token: addr('CXLM') },
    ledger: 114
  });
  emit('manager', 'CMANAGER', 'dao_launched', {
    topics: [addr('CTOK1')],
    data: { launched_ledger: u64(116), modules: modules(1), launch_auction: bool(false), launch_marketplace: bool(true), registry: registry(1) }, ledger: 116
  });
  // Every module emits its own launch event (topic treasury; the ClaimMinter's is
  // claim_minter_launched) and hands its admin from the launch admin to the Treasury
  // (admin_changed). The auction was not launched, so the Token grants nothing.
  emit('token', d1.token, 'token_launched', { topics: [addr(d1.treasury)], data: { grants: vec() }, ledger: 116, evt: 1 });
  emit('governor', d1.governor, 'governor_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 2 });
  emit('treasury', d1.treasury, 'treasury_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 3 });
  emit('metadata', d1.metadata, 'metadata_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 4 });
  emit('auction', d1.auction, 'auction_launched', { topics: [addr(d1.treasury)], data: { started: bool(false) }, ledger: 116, evt: 5 });
  emit('marketplace', d1.marketplace, 'marketplace_launched', { topics: [addr(d1.treasury)], data: { opened: bool(true) }, ledger: 116, evt: 6 });
  emit('claims', d1.claims, 'claim_minter_launched', { topics: [addr(d1.treasury)], ledger: 116, evt: 7 });
  ['token', 'governor', 'treasury', 'metadata', 'auction', 'marketplace', 'claims'].forEach((role, k) => {
    emit(role, d1[role], 'admin_changed', { topics: [addr('GLAUNCH'), addr(d1.treasury)], ledger: 116, evt: 8 + k });
  });
  emit('manager', 'CMANAGER', 'slug_claimed', { topics: [addr('CTOK1'), str('dao-one')], ledger: 116, evt: 15 });
  // Governance grants the ClaimMinter ten mints.
  emit('token', d1.token, 'mint_allowance_changed', { topics: [addr(d1.claims)], data: { old_allowance: u32(0), allowance: u32(10), changed_by: addr(d1.treasury) }, ledger: 118 });
  emit('manager', 'CMANAGER', 'admin_proposed', { topics: [addr('GADMIN'), addr('GADMIN2')], ledger: 104 });
  emit('manager', 'CMANAGER', 'admin_changed', { topics: [addr('GADMIN'), addr('GADMIN2')], ledger: 105 });
  // Fixtures for the post-hardening events (assertions on the matching views are reconciled separately).
  emit('manager', 'CMANAGER', 'admin_proposal_cancelled', { topics: [addr('GADMIN2'), addr('GADMIN3')], ledger: 105, evt: 1 });
  emit('auction', d1.auction, 'upgraded', { topics: [bytes('a20'), bytes('b20')], data: { version: str('0.2.0') }, ledger: 117 });
  // version() is the registry version of the running hash: register both.
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('b20')], data: { name: str('Auction'), version: str('0.2.0'), published_ledger: u64(117) }, ledger: 117, evt: 1 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('a01')], data: { name: str('Token'), version: str('0.1.0'), published_ledger: u64(100) }, ledger: 100, evt: 1 });
  emit('manager', 'CMANAGER', 'implementation_registered', { topics: [bytes('a31')], data: { name: str('Governor'), version: str('0.1.0'), published_ledger: u64(100) }, ledger: 100, evt: 2 });
  emit('auction', d1.auction, 'migrated', { data: { from_storage_version: u32(1), to_storage_version: u32(2) }, ledger: 119 });
  // Platform events (no DAO of their own): fanned out to every DAO's feed by app.activity_feed (0015).
  emit('manager', 'CMANAGER', 'upgrade_delay_changed', { data: { from_ledgers: u32(720), to_ledgers: u32(120), effective_ledger: u32(880) }, ledger: 200 });
  emit('manager', 'CMANAGER', 'manager_upgraded', { topics: [bytes('mg1'), bytes('mg2')], data: { from_version: str('0.1.0'), to_version: str('0.2.0'), upgraded_ledger: u64(201) }, ledger: 201 });
  // The ClaimMinter is a DAO module: its upgrade is its DAO's news, not the platform's.
  emit('claims', d1.claims, 'upgraded', { topics: [bytes('a61'), bytes('c72')], data: { version: str('0.2.0') }, ledger: 202 });
  emit('claims', d1.claims, 'migrated', { data: { from_storage_version: u32(1), to_storage_version: u32(2) }, ledger: 202, evt: 1 });
  // A revoked implementation reaches only the DAOs running it (CTOK1's governor runs a31).
  emit('manager', 'CMANAGER', 'implementation_revoked', { topics: [bytes('a31')], data: { revoked_ledger: u64(204) }, ledger: 204 });
  // The factory pause has no getter on chain; manager.settings carries it.
  emit('manager', 'CMANAGER', 'factory_paused', { ledger: 205 });
  emit('manager', 'CMANAGER', 'factory_unpaused', { ledger: 206 });
  emit('manager', 'CMANAGER', 'factory_paused', { ledger: 207 });
  // A third DAO created after the platform events (it must not inherit them) with no
  // modules at all, then given a ClaimMinter in Setup by create_module (deployed from the
  // Manager's current implementation for the kind).
  createDao(3, 208, { deployer: 'GDEPLOYER3', launch: 'GLAUNCH3', slug: 'dao-three', kinds: [] });
  emit('manager', 'CMANAGER', 'module_created', { topics: [addr('CTOK3'), sym('claims')], data: { n: u32(1), address: addr('CCLM3') }, ledger: 209 });
  emit('token', 'CTOK3', 'module_registered', { topics: [sym('claims')], data: { address: addr('CCLM3'), non_voting: bool(false) }, ledger: 209, evt: 1 });
  // A fourth DAO launched with the auction started (the auction's own `unpaused`
  // lands in the launch transaction, before DaoLaunched), then paused by vote;
  // its marketplace closed and reopened by vote.
  const d4 = dao(4);
  createDao(4, 300, { deployer: 'GDEPLOYER4', launch: 'GLAUNCH4', slug: 'dao-four', kinds: ['auction', 'marketplace'] });
  emit('auction', d4.auction, 'unpaused', { ledger: 301, evt: 0 });
  emit('manager', 'CMANAGER', 'dao_launched', {
    topics: [addr('CTOK4')], data: { launched_ledger: u64(301), modules: modules(4, ['auction', 'marketplace']), launch_auction: bool(true), launch_marketplace: bool(true), registry: registry(4, ['auction', 'marketplace']) }, ledger: 301, evt: 1
  });
  emit('auction', d4.auction, 'paused', { ledger: 310 });
  emit('marketplace', d4.marketplace, 'marketplace_paused', { topics: [addr(d4.treasury)], ledger: 311 });
  emit('marketplace', d4.marketplace, 'marketplace_unpaused', { topics: [addr(d4.treasury)], ledger: 312 });
  emit('auction', d1.auction, 'unpaused', { ledger: 130 });
  // After launch: a rename (token 0.2.0 MetadataUpdated) and a vote that closes the market.
  emit('token', d1.token, 'metadata_updated', { data: { name: str('Alpha Club'), symbol: str('ALPHA') }, ledger: 150, tx: 7 });
  emit('marketplace', d1.marketplace, 'marketplace_paused', { topics: [addr(d1.treasury)], ledger: 151, tx: 7 });
  // Slug changes by vote (Manager 0.2.0): two in one transaction (dao-one -> dao-uno -> alpha-club),
  // then a pending DAO's request for the freed 'dao-one' stays a request (it is not reserved).
  emit('manager', 'CMANAGER', 'slug_changed', { topics: [addr('CTOK1'), str('dao-uno')], data: { old_slug: str('dao-one') }, ledger: 152, tx: 2, evt: 0 });
  emit('manager', 'CMANAGER', 'slug_changed', { topics: [addr('CTOK1'), str('alpha-club')], data: { old_slug: str('dao-uno') }, ledger: 152, tx: 2, evt: 1 });

  // --- token: a 6-token batch mint in ONE transaction (13 events, indexes >= 10),
  // each mint bumping GALICE's voting power, then one mint_batch_with_minter for
  // the range. The last event must win even though 'event-9' sorts after
  // 'event-11' as text.
  for (let k = 0; k < 6; k += 1) {
    emit('token', d1.token, 'mint', { topics: [addr('GALICE')], data: { token_id: u32(k + 1) }, ledger: 120, tx: 3, evt: 2 * k });
    emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(k), new_votes: u128(k + 1) }, ledger: 120, tx: 3, evt: 2 * k + 1 });
  }
  emit('token', d1.token, 'mint_batch_with_minter', { topics: [addr(d1.claims)], data: { first_token_id: u32(1), count: u32(6) }, ledger: 120, tx: 3, evt: 12 });
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr('GBOB')], data: { token_id: u32(1) }, ledger: 121, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(6), new_votes: u128(5) }, ledger: 121, evt: 1 });
  emit('token', d1.token, 'delegate_changed', { topics: [addr('GBOB')], data: { from_delegate: VOID, to_delegate: addr('GBOB') }, ledger: 121, evt: 2 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GBOB')], data: { previous_votes: u128(0), new_votes: u128(1) }, ledger: 121, evt: 3 });
  // A token moved to the Treasury leaves the voting supply: its holder's delegate
  // loses the vote and the Treasury gains none.
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr(d1.treasury)], data: { token_id: u32(2) }, ledger: 122, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(5), new_votes: u128(4) }, ledger: 122, evt: 1 });

  // Approvals: one for token 3 (cleared by its later transfer? no: token 3 stays), one cleared, one operator.
  emit('token', d1.token, 'approve', { topics: [addr('GALICE'), u32(3)], data: { approved: addr('GOPER'), live_until_ledger: u32(900000) }, ledger: 123, evt: 0 });
  emit('token', d1.token, 'approve', { topics: [addr('GALICE'), u32(4)], data: { approved: addr('GOPER'), live_until_ledger: u32(900000) }, ledger: 123, evt: 1 });
  emit('token', d1.token, 'approve', { topics: [addr('GALICE'), u32(4)], data: { approved: addr('GALICE'), live_until_ledger: u32(0) }, ledger: 123, evt: 2 });
  emit('token', d1.token, 'approve', { topics: [addr('GALICE'), u32(5)], data: { approved: addr('GOPER'), live_until_ledger: u32(900000) }, ledger: 123, evt: 3 });
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr('GCAROL')], data: { token_id: u32(5) }, ledger: 124 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(4), new_votes: u128(3) }, ledger: 124, evt: 1 });
  emit('token', d1.token, 'approve_for_all', { topics: [addr('GBOB')], data: { operator: addr('GOPER'), live_until_ledger: u32(900000) }, ledger: 124, evt: 2 });

  // A 12-event run in one transaction for another delegate: indexes 10 and 11
  // must beat index 9 (text order would put '-event-9' last).
  for (let k = 0; k < 12; k += 1) {
    emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GDAVE')], data: { previous_votes: u128(k), new_votes: u128(k + 1) }, ledger: 125, evt: k });
  }

  // --- governor / treasury -----------------------------------------------------
  emit('governor', d1.governor, 'governor_initialized', {
    topics: [addr('GOWNER')],
    data: { token_contract: addr(d1.token), treasury_contract: addr(d1.treasury), voting_delay: u32(1), voting_period: u32(10), queue_delay: u32(1), proposal_threshold: u128(1), quorum_bps: u32(1000) },
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
  // Event-only comments (governor 0.2.0), in any proposal state.
  emit('governor', d1.governor, 'proposal_commented', { topics: [bytes('p1'), addr('GBOB')], data: { body: str('Shipped, thanks all') }, ledger: 147, evt: 1 });
  emit('governor', d1.governor, 'proposal_commented', { topics: [bytes('p3'), addr('GALICE')], data: { body: str('Withdrawn for now') }, ledger: 147, evt: 2 });
  // Free text with a NUL: jsonb refuses U+0000, so the decoder replaces it with U+FFFD.
  emit('governor', d1.governor, 'proposal_commented', { topics: [bytes('p3'), addr('GCAROL')], data: { body: str('nul\u0000byte') }, ledger: 147, evt: 3 });
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
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID1')], data: { amount: i128(20), extended: bool(false), new_end_time: u64(2000), comment: str('gm') }, ledger: 151 });
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID2')], data: { amount: i128(30), extended: bool(true), new_end_time: u64(2300), comment: str('') }, ledger: 152 });
  emit('auction', d1.auction, 'bid_refunded', { topics: [u128(7), addr('GBID1')], data: { amount: i128(20) }, ledger: 152, evt: 1 });
  // A refund whose push failed is credited, then pulled by the bidder.
  emit('auction', d1.auction, 'bid_placed', { topics: [u128(7), addr('GBID3')], data: { amount: i128(40), extended: bool(false), new_end_time: u64(2300), comment: str('') }, ledger: 153 });
  emit('auction', d1.auction, 'refund_deferred', { topics: [u128(7), addr('GBID2')], data: { amount: i128(30) }, ledger: 153, evt: 1 });
  emit('auction', d1.auction, 'refund_withdrawn', { topics: [addr('GBID2')], data: { amount: i128(30) }, ledger: 154 });
  emit('auction', d1.auction, 'auction_settled', { topics: [u128(7)], data: { winner: addr('GBID2'), amount: i128(30) }, ledger: 160 });
  emit('auction', d1.auction, 'duration_updated', { data: { duration: u64(7200), changed_by: addr('GOWNER') }, ledger: 161 });
  auctionCreated(8, 162);
  emit('auction', d1.auction, 'auction_cancelled', { topics: [u128(8)], data: { reason: u32(1), cancelled_by: addr('GOWNER') }, ledger: 163 });
  auctionCreated(9, 164);
  emit('auction', d1.auction, 'auction_settled', { topics: [u128(9)], data: { winner: VOID, amount: i128(0) }, ledger: 165 });
  emit('auction', d1.auction, 'refund_deferred', { topics: [u128(9), addr('GBID4')], data: { amount: i128(7) }, ledger: 166 });
  // The current auction: open, no bids yet.
  auctionCreated(10, 167);

  // --- metadata ----------------------------------------------------------------
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(0)], data: { name: str('bg') }, ledger: 170 });
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(1)], data: { name: str('body') }, ledger: 171 });
  emit('metadata', d1.metadata, 'properties_reset', { data: { old_num_properties: u32(0) }, ledger: 172 });
  emit('metadata', d1.metadata, 'property_added', { topics: [u32(0)], data: { name: str('bg2') }, ledger: 173 });
  emit('metadata', d1.metadata, 'seed_generated', { topics: [u32(3)], data: { num_properties: u32(1), selections: vec(u32(2)) }, ledger: 173, evt: 1 });
  // A batch seeds tokens 4 and 5 in one event (a token is seeded once: regenerate refuses a seeded token).
  emit('metadata', d1.metadata, 'seeds_generated', { topics: [u32(4)], data: { count: u32(2), num_properties: u32(1), selections: vec(vec(u32(1), u32(0)), vec(u32(1), u32(1))) }, ledger: 173, evt: 2 });
  emit('metadata', d1.metadata, 'profile_updated', {
    topics: [u32(1)], data: { hash: bytes('p1'), profile: str('{"v":1,"description":"Alpha DAO v2","image":"img1"}') }, ledger: 174
  });

  // --- marketplace -------------------------------------------------------------
  // Quick-buy pools: pool 0 for three tokens; a restock mints them into Marketplace custody
  // (non-voting); one sells, the pool is closed and one unsold token swept to the Treasury.
  const poolOpened = (id, ledger, size) => emit('marketplace', d1.marketplace, 'pool_opened', {
    topics: [u32(id)], data: { price: i128(100), asset: addr('CXLM'), expires_at: u64(5000), size: u32(size), max_per_buyer: u32(1), max_sold_per_period: u32(5), period_secs: u64(3600) }, ledger
  });
  poolOpened(0, 180, 3);
  for (let k = 0; k < 3; k += 1) emit('token', d1.token, 'mint', { topics: [addr(d1.marketplace)], data: { token_id: u32(20 + k) }, ledger: 180, tx: 1, evt: k });
  emit('marketplace', d1.marketplace, 'pool_restocked', { topics: [u32(0)], data: { first_token_id: u32(20), count: u32(3), stocked: u32(3) }, ledger: 180, tx: 1, evt: 3 });
  emit('token', d1.token, 'transfer', { topics: [addr(d1.marketplace), addr('GBUYER')], data: { token_id: u32(21) }, ledger: 181, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GBUYER')], data: { previous_votes: u128(0), new_votes: u128(1) }, ledger: 181, evt: 1 });
  emit('marketplace', d1.marketplace, 'pool_purchased', { topics: [u32(0), addr('GBUYER')], data: { token_id: u32(21), price: i128(100), asset: addr('CXLM') }, ledger: 181, evt: 2 });
  poolOpened(1, 187, 5);
  emit('marketplace', d1.marketplace, 'pool_closed', { topics: [u32(1)], data: { released: u32(5) }, ledger: 188 });
  emit('marketplace', d1.marketplace, 'pool_closed', { topics: [u32(0)], data: { released: u32(0) }, ledger: 189 });
  emit('token', d1.token, 'transfer', { topics: [addr(d1.marketplace), addr(d1.treasury)], data: { token_id: u32(22) }, ledger: 189, evt: 1 });
  emit('marketplace', d1.marketplace, 'pool_swept', { topics: [u32(0)], data: { count: u32(1), pages_left: u32(1) }, ledger: 189, evt: 2 });
  poolOpened(2, 196, 2); // still open, nothing stocked
  // The pool buyer relists token 21: the Marketplace escrows it again, as a secondary listing,
  // which must not make it pool stock again.
  emit('token', d1.token, 'transfer', { topics: [addr('GBUYER'), addr(d1.marketplace)], data: { token_id: u32(21) }, ledger: 197, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GBUYER')], data: { previous_votes: u128(1), new_votes: u128(0) }, ledger: 197, evt: 1 });
  emit('marketplace', d1.marketplace, 'secondary_listing_created', {
    topics: [u32(21)], data: { seller: addr('GBUYER'), price: i128(150), expires_at: u64(5000), fee_bps: u32(250), payment_asset: addr('CXLM') }, ledger: 197, evt: 2
  });
  const secondary = (id, ledger) => emit('marketplace', d1.marketplace, 'secondary_listing_created', {
    topics: [u32(id)], data: { seller: addr('GSELLER'), price: i128(100), expires_at: u64(5000), fee_bps: u32(250), payment_asset: addr('CXLM') }, ledger
  });
  secondary(10, 182);
  emit('marketplace', d1.marketplace, 'listing_cancelled', { topics: [u32(10)], data: { seller: addr('GSELLER') }, ledger: 183 });
  secondary(11, 184);
  emit('marketplace', d1.marketplace, 'listing_commented', { topics: [u32(11), addr('GBUYER')], data: { body: str('Would you take 80?') }, ledger: 184, evt: 1 });
  secondary(12, 185);
  emit('marketplace', d1.marketplace, 'listing_purchased', {
    topics: [u32(12), addr('GBUYER')], data: { seller: addr('GSELLER'), price: i128(100), fee: i128(2), payment_asset: addr('CXLM') }, ledger: 186
  });

  // --- claims (DAO 1's ClaimMinter) ---------------------------------------------
  emit('claims', d1.claims, 'list_opened', {
    topics: [u32(0)], data: { root: bytes('r1'), tree_uri: str('ipfs://tree1'), asset: addr('CXLM'), price: i128(50), expires_at: u64(9000), total: u32(10), assurance: VOID }, ledger: 190
  });
  emit('claims', d1.claims, 'claimed', { topics: [u32(0), addr('GALICE')], data: { amount: u32(2), first_token_id: u32(30), paid: i128(100), escrowed: bool(false), claimed: u32(2) }, ledger: 191 });
  emit('claims', d1.claims, 'claimed', { topics: [u32(0), addr('GALICE')], data: { amount: u32(1), first_token_id: u32(33), paid: i128(50), escrowed: bool(false), claimed: u32(3) }, ledger: 192 });
  emit('claims', d1.claims, 'claimed', { topics: [u32(0), addr('GBOB')], data: { amount: u32(1), first_token_id: u32(32), paid: i128(50), escrowed: bool(false), claimed: u32(1) }, ledger: 192, evt: 1 });
  emit('claims', d1.claims, 'list_opened', {
    topics: [u32(1)], data: { root: bytes('r2'), tree_uri: str('ipfs://tree2'), asset: addr('CXLM'), price: i128(0), expires_at: u64(9000), total: u32(5), assurance: VOID }, ledger: 195
  });

  // --- an external module (kind custom_vault, role module) ----------------------
  // Registered by vote and made a transfer agent, it moves a membership with the holder's
  // signature, then is unregistered (which revokes the agent): its later events leave the DAO.
  emit('token', d1.token, 'module_registered', { topics: [sym('custom_vault')], data: { address: addr('CVAULT'), non_voting: bool(true) }, ledger: 230 });
  emit('token', d1.token, 'transfer_agent_changed', { topics: [addr('CVAULT')], data: { enabled: bool(true), changed_by: addr(d1.treasury) }, ledger: 230, evt: 1 });
  emit('module', 'CVAULT', 'vault_opened', { topics: [addr('GALICE')], data: { seats: u32(3) }, ledger: 231 });
  emit('token', d1.token, 'transfer', { topics: [addr('GALICE'), addr('GBOB')], data: { token_id: u32(6) }, ledger: 231, tx: 1, evt: 0 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GALICE')], data: { previous_votes: u128(3), new_votes: u128(2) }, ledger: 231, tx: 1, evt: 1 });
  emit('token', d1.token, 'delegate_votes_changed', { topics: [addr('GBOB')], data: { previous_votes: u128(1), new_votes: u128(2) }, ledger: 231, tx: 1, evt: 2 });
  emit('token', d1.token, 'agent_transfer', { topics: [addr('CVAULT')], data: { from: addr('GALICE'), to: addr('GBOB'), token_id: u32(6) }, ledger: 231, tx: 1, evt: 3 });
  emit('token', d1.token, 'module_unregistered', { topics: [sym('custom_vault')], data: { address: addr('CVAULT') }, ledger: 232 });
  emit('token', d1.token, 'transfer_agent_changed', { topics: [addr('CVAULT')], data: { enabled: bool(false), changed_by: addr(d1.treasury) }, ledger: 232, evt: 1 });
  emit('module', 'CVAULT', 'vault_closed', { topics: [addr('GALICE')], data: { seats: u32(0) }, ledger: 233 });

  // --- membership switches (docs/designs/locked-tokens.md) ----------------------
  // Locked by vote, recovery turned on and a lost-key member's token moved by proposal;
  // members-only delegation turned on and off again.
  emit('token', d1.token, 'transfers_lock_changed', { data: { locked: bool(true), changed_by: addr(d1.treasury) }, ledger: 240 });
  emit('token', d1.token, 'dao_recovery_changed', { data: { enabled: bool(true), changed_by: addr(d1.treasury) }, ledger: 241 });
  emit('token', d1.token, 'transfer', { topics: [addr('GCAROL'), addr('GERIN')], data: { token_id: u32(5) }, ledger: 242, evt: 0 });
  emit('token', d1.token, 'dao_transfer', { topics: [addr('GCAROL'), addr('GERIN')], data: { token_id: u32(5), changed_by: addr(d1.treasury) }, ledger: 242, evt: 1 });
  emit('token', d1.token, 'members_only_delegation_changed', { data: { enabled: bool(true), changed_by: addr(d1.treasury) }, ledger: 243 });
  emit('token', d1.token, 'members_only_delegation_changed', { data: { enabled: bool(false), changed_by: addr(d1.treasury) }, ledger: 244 });
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
    // An external module's own events are not the platform's contracts' (positional decoding).
    if (role === 'module') continue;
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

test('manager: registry, launches, slugs and implementations', { skip }, () => {
  const daos = rows(`SELECT * FROM manager.daos ORDER BY created_ledger`);
  assert.equal(daos.length, 4);
  const [a, b, c, d] = daos;
  assert.equal(a.dao_id, 'CTOK1');
  assert.equal(a.deployer, 'GDEPLOYER');
  assert.equal(a.launch_admin, 'GLAUNCH');
  assert.equal(a.slug, 'alpha-club', 'the latest slug_changed wins, ordered by event position');
  assert.deepEqual([a.slug_claimed, a.requested_slug, a.claimed_slug], [true, 'dao-one', 'alpha-club']);
  assert.equal(b.slug, 'dao-two', 'a pending DAO shows its latest requested slug');
  assert.deepEqual([b.slug_claimed, b.requested_slug, b.claimed_slug], [false, 'dao-two', null], 'the failed drive released its reservation');
  assert.equal(b.assurance_outcome, 'released');
  assert.equal(a.assurance_outcome, null);
  assert.equal(c.slug, 'dao-three');
  assert.equal(one(`SELECT created_slug FROM manager.dao_registry WHERE dao_id = 'CTOK2'`).created_slug, 'dao-one');
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.daos WHERE claimed_slug IN ('dao-one', 'dao-two')`).n, 0, 'a released slug is nobody\'s claimed slug');
  assert.deepEqual(
    rows(`SELECT dao_id, slug, ledger_sequence, event_index FROM manager.dao_previous_slugs ORDER BY ledger_sequence, event_index`),
    [{ dao_id: 'CTOK1', slug: 'dao-one', ledger_sequence: 152, event_index: 0 }, { dao_id: 'CTOK1', slug: 'dao-uno', ledger_sequence: 152, event_index: 1 }]
  );
  assert.deepEqual(
    [a.token_contract, a.governor_contract, a.auction_contract, a.treasury_contract, a.metadata_contract, a.marketplace_contract, a.claims_contract],
    ['CTOK1', 'CGOV1', 'CAUC1', 'CTRE1', 'CMETA1', 'CMKT1', 'CCLM1']
  );
  // Every module is optional: DAO 3 was created without any and given a ClaimMinter in Setup.
  assert.deepEqual([c.auction_contract, c.marketplace_contract, c.claims_contract], [null, null, 'CCLM3']);
  assert.deepEqual([d.auction_contract, d.marketplace_contract, d.claims_contract], ['CAUC4', 'CMKT4', null]);
  assert.deepEqual(
    one(`SELECT auction_contract, marketplace_contract, claims_contract, claims_wasm_hash FROM manager.dao_registry WHERE dao_id = 'CTOK3'`),
    { auction_contract: null, marketplace_contract: null, claims_contract: null, claims_wasm_hash: null },
    'the registry row is what create_dao deployed'
  );
  assert.equal(a.token_name, 'Alpha Club', 'name follows the latest MetadataUpdated');
  assert.equal(a.token_symbol, 'ALPHA');
  assert.equal(a.admin_address, 'CTRE1', 'the current admin: the Treasury after the launch handoff');
  assert.equal(b.admin_address, 'GLAUNCH2', 'a pending DAO keeps its launch admin');
  assert.equal(a.profile, '{"v":1,"description":"Alpha DAO v2","image":"img1"}', 'the profile follows the highest seq');
  assert.equal(a.profile_hash, 'p1');
  assert.equal(Number(a.profile_seq), 1);
  assert.equal(b.profile_seq, null, 'no profile event indexed yet');
  assert.equal(a.status, 'operational');
  assert.equal(a.launched_ledger, 116);
  // Launched with the auction disabled, then unpaused: enabled and not paused.
  assert.deepEqual([a.auction_enabled, a.auction_paused, a.marketplace_enabled], [true, false, false], 'a market opened at launch and closed by vote is off');
  assert.ok(a.indexed_at);
  assert.deepEqual([b.status, b.auction_enabled, b.auction_paused, b.marketplace_enabled], ['pending', null, null, null]);
  // Launched with the auction started (its launch-tx `unpaused` is not a reactivation),
  // then paused by vote; marketplace closed then reopened by vote.
  assert.deepEqual([d.dao_id, d.auction_enabled, d.auction_paused, d.marketplace_enabled], ['CTOK4', true, true, true]);

  assert.deepEqual(
    rows(`SELECT module_role, kind, module_contract, created_wasm_hash, non_voting, registered FROM manager.dao_modules WHERE dao_id = 'CTOK1' ORDER BY module_role`)
      .map((r) => [r.module_role, r.kind, r.module_contract, r.created_wasm_hash, r.non_voting, r.registered]),
    [
      ['auction', 'auction', 'CAUC1', 'a21', true, true], ['claims', 'claims', 'CCLM1', 'a61', false, true],
      ['governor', 'governor', 'CGOV1', 'a31', false, true], ['marketplace', 'marketplace', 'CMKT1', 'a51', true, true],
      ['metadata', 'metadata', 'CMETA1', 'a11', false, true], ['module', 'custom_vault', 'CVAULT', null, true, false],
      ['token', 'token', 'CTOK1', 'a01', false, true], ['treasury', 'treasury', 'CTRE1', 'a41', false, true]
    ],
    'the core four, each registered module (an external one has no known creation hash) and the unregistered vault'
  );
  assert.equal(one(`SELECT created_wasm_hash FROM manager.dao_modules WHERE module_contract = 'CCLM3'`).created_wasm_hash, 'c7',
    'create_module deploys the Manager\'s current implementation for the kind');
  // Core four x 4 DAOs, plus each registration window: DAO 1 four (with the vault), DAO 2 three, DAO 3 one, DAO 4 two.
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.event_identity`).n, 26);
  assert.deepEqual(
    one(`SELECT module_role, until_pos IS NOT NULL AS closed FROM manager.event_identity WHERE contract_id = 'CVAULT'`),
    { module_role: 'module', closed: true }
  );
  const launch = one(`SELECT launch_auction, launch_marketplace, registry, launched_ledger FROM manager.dao_launches WHERE dao_id = 'CTOK1'`);
  assert.deepEqual([launch.launch_auction, launch.launch_marketplace, launch.launched_ledger], [false, true, 116]);
  assert.deepEqual(launch.registry, [
    { address: 'CAUC1', kind: 'auction', non_voting: true },
    { address: 'CMKT1', kind: 'marketplace', non_voting: true },
    { address: 'CCLM1', kind: 'claims', non_voting: false }
  ]);
  assert.deepEqual(
    rows(`SELECT module_role, module_contract, is_live, treasury, started, opened FROM manager.module_launches WHERE dao_id = 'CTOK1' AND module_role <> 'module' ORDER BY module_role`),
    ['auction', 'claims', 'governor', 'marketplace', 'metadata', 'token', 'treasury'].map((role) => ({
      module_role: role, module_contract: { auction: 'CAUC1', claims: 'CCLM1', governor: 'CGOV1', marketplace: 'CMKT1', metadata: 'CMETA1', token: 'CTOK1', treasury: 'CTRE1' }[role],
      is_live: true, treasury: 'CTRE1', started: role === 'auction' ? false : null, opened: role === 'marketplace' ? true : null
    }))
  );
  assert.deepEqual(one(`SELECT grants FROM manager.module_launches WHERE dao_id = 'CTOK1' AND module_role = 'token'`).grants, [], 'no auction launched, no grant');
  assert.deepEqual(
    rows(`SELECT dao_id, claim_minter, list_id, deadline, launch_auction, launch_marketplace, outcome FROM manager.assurance_drives`).map((r) => ({ ...r, list_id: Number(r.list_id), deadline: Number(r.deadline) })),
    [{ dao_id: 'CTOK2', claim_minter: 'CCLM2', list_id: 0, deadline: 9000, launch_auction: false, launch_marketplace: true, outcome: 'released' }]
  );
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.module_launches WHERE dao_id = 'CTOK2' AND is_live`).n, 0);

  const impls = rows(`SELECT wasm_hash, name, published_ledger, revoked, revoked_ledger FROM manager.implementations ORDER BY wasm_hash`);
  assert.deepEqual(impls, [
    { wasm_hash: 'a01', name: 'Token', published_ledger: 100, revoked: false, revoked_ledger: null },
    { wasm_hash: 'a31', name: 'Governor', published_ledger: 100, revoked: true, revoked_ledger: 204 },
    { wasm_hash: 'aa', name: 'token', published_ledger: 5, revoked: false, revoked_ledger: null },
    { wasm_hash: 'b20', name: 'Auction', published_ledger: 117, revoked: false, revoked_ledger: null },
    { wasm_hash: 'bb', name: 'auction', published_ledger: 6, revoked: true, revoked_ledger: 9 }
  ]);
  const settings = one(`SELECT admin, pending_admin, factory_paused FROM manager.settings`);
  assert.deepEqual(settings, { admin: 'GADMIN2', pending_admin: null, factory_paused: true }, 'the latest factory event wins');
});

test('token: ownership, members, voting power, allowances, switches and approvals', { skip }, () => {
  const inventory = rows(`SELECT token_id, owner FROM token.inventory WHERE dao_id = 'CTOK1' ORDER BY token_id`);
  assert.equal(inventory.length, 9, 'a mint is counted once although a minter event accompanies it');
  assert.deepEqual(inventory.map((r) => [Number(r.token_id), r.owner]), [
    [1, 'GBOB'], [2, 'CTRE1'], [3, 'GALICE'], [4, 'GALICE'], [5, 'GERIN'], [6, 'GBOB'], [20, 'CMKT1'], [21, 'CMKT1'], [22, 'CTRE1']
  ], 'token 21 is listed for resale (escrowed by the Marketplace)');
  assert.equal(one(`SELECT count(*)::int AS n FROM token.transfers WHERE transfer_type = 'transfer'`).n, 8);

  const members = rows(`SELECT address, owned_token_count, voting_power, delegated_to, last_activity_ledger FROM token.members ORDER BY address`);
  assert.deepEqual(members, [
    { address: 'CMKT1', owned_token_count: 2, voting_power: 0, delegated_to: null, last_activity_ledger: 197 },
    { address: 'CTRE1', owned_token_count: 2, voting_power: 0, delegated_to: null, last_activity_ledger: 189 },
    { address: 'GALICE', owned_token_count: 2, voting_power: 2, delegated_to: null, last_activity_ledger: 120 },
    { address: 'GBOB', owned_token_count: 2, voting_power: 2, delegated_to: 'GBOB', last_activity_ledger: 231 },
    { address: 'GDAVE', owned_token_count: 0, voting_power: 12, delegated_to: null, last_activity_ledger: null },
    { address: 'GERIN', owned_token_count: 1, voting_power: 0, delegated_to: null, last_activity_ledger: 242 }
  ]);
  // The Treasury's tokens, the Marketplace's pool stock and its escrowed listing carry no votes.
  assert.deepEqual(
    one(`SELECT minted_supply, system_held_supply, voting_supply FROM token.supply WHERE dao_id = 'CTOK1'`),
    { minted_supply: 9, system_held_supply: 4, voting_supply: 5 }
  );
  assert.deepEqual(
    one(`SELECT minted_supply, system_held_supply, voting_supply FROM token.supply WHERE dao_id = 'CTOK2'`),
    { minted_supply: 0, system_held_supply: 0, voting_supply: 0 }
  );
  assert.deepEqual(rows(`SELECT module, allowance, changed_by FROM token.mint_allowances`), [{ module: 'CCLM1', allowance: 10, changed_by: 'CTRE1' }]);
  assert.deepEqual(rows(`SELECT kind, module, non_voting FROM token.modules WHERE dao_id = 'CTOK1' ORDER BY kind`), [
    { kind: 'auction', module: 'CAUC1', non_voting: true },
    { kind: 'claims', module: 'CCLM1', non_voting: false },
    { kind: 'marketplace', module: 'CMKT1', non_voting: true }
  ], 'the unregistered vault is gone');
  // Token 4's approval was cleared (live_until_ledger 0); token 5 moved after it was approved.
  assert.deepEqual(rows(`SELECT token_id, owner, approved, live_until_ledger FROM token.approvals ORDER BY token_id`), [
    { token_id: 3, owner: 'GALICE', approved: 'GOPER', live_until_ledger: 900000 }
  ]);
  assert.deepEqual(rows(`SELECT owner, operator FROM token.operator_approvals`), [{ owner: 'GBOB', operator: 'GOPER' }]);

  // Membership switches: the creation settings overridden by their latest changes.
  assert.deepEqual(
    rows(`SELECT dao_id, transfers_locked, members_only_delegation, dao_recovery, last_changed_ledger FROM token.settings ORDER BY dao_id`),
    [
      { dao_id: 'CTOK1', transfers_locked: true, members_only_delegation: false, dao_recovery: true, last_changed_ledger: 244 },
      { dao_id: 'CTOK2', transfers_locked: false, members_only_delegation: false, dao_recovery: false, last_changed_ledger: null },
      { dao_id: 'CTOK3', transfers_locked: false, members_only_delegation: false, dao_recovery: false, last_changed_ledger: null },
      { dao_id: 'CTOK4', transfers_locked: false, members_only_delegation: false, dao_recovery: false, last_changed_ledger: null }
    ]
  );
  assert.deepEqual(rows(`SELECT module FROM token.transfer_agents`), [], 'unregistering the vault revoked it as an agent');
  assert.deepEqual(
    rows(`SELECT transfer_kind, token_id, from_address, to_address, moved_by FROM token.managed_transfers ORDER BY event_ledger`).map((r) => ({ ...r, token_id: Number(r.token_id) })),
    [
      { transfer_kind: 'agent', token_id: 6, from_address: 'GALICE', to_address: 'GBOB', moved_by: 'CVAULT' },
      { transfer_kind: 'dao', token_id: 5, from_address: 'GCAROL', to_address: 'GERIN', moved_by: 'CTRE1' }
    ]
  );
  // The delegate picker: custody holders (the Treasury, non-voting modules) are never members.
  assert.deepEqual(
    rows(`SELECT address, voting_power, delegator_count, custody, is_member FROM token.delegates WHERE dao_id = 'CTOK1' ORDER BY address`),
    [
      { address: 'CMKT1', voting_power: 0, delegator_count: 0, custody: true, is_member: false },
      { address: 'CTRE1', voting_power: 0, delegator_count: 0, custody: true, is_member: false },
      { address: 'GALICE', voting_power: 2, delegator_count: 0, custody: false, is_member: true },
      { address: 'GBOB', voting_power: 2, delegator_count: 0, custody: false, is_member: true },
      { address: 'GDAVE', voting_power: 12, delegator_count: 0, custody: false, is_member: false },
      { address: 'GERIN', voting_power: 0, delegator_count: 0, custody: false, is_member: true }
    ]
  );
});

test('governance: proposals, votes, state, settings and comments', { skip }, () => {
  assert.deepEqual(
    one(`SELECT dao_id, admin, voting_delay_seconds, voting_period_seconds, queue_delay_seconds, proposal_threshold, quorum_bps, updated_ledger FROM governance.settings`),
    { dao_id: 'CTOK1', admin: 'CTRE1', voting_delay_seconds: 1, voting_period_seconds: 20, queue_delay_seconds: 1, proposal_threshold: 1, quorum_bps: 1000, updated_ledger: 136 },
    'constructor values overlaid with the latest setter events'
  );
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'quorum_changed'`).kind, 'governance.quorum_changed');
  const proposals = rows(`SELECT proposal_number, proposal_id, proposer, state, eta_seconds, snapshot_ledger, vote_start_seconds, vote_end_seconds, quorum_votes, action_count, for_votes, against_votes, abstain_votes, updated_ledger FROM app.proposal_list WHERE dao_id = 'CTOK1' ORDER BY proposal_number`);
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
  assert.equal(p1.updated_ledger, 144);
  assert.deepEqual([p1.for_votes, p1.against_votes, p1.abstain_votes].map(Number), [5, 1, 2]);
  assert.deepEqual([proposals[1].for_votes, proposals[1].against_votes, proposals[1].abstain_votes].map(Number), [0, 0, 0], 'no votes yet is a zero tally');

  const detail = one(`SELECT actions FROM app.proposal_detail WHERE proposal_id = 'p1'`);
  assert.deepEqual(detail.actions.map((a) => [a.action_index, a.target, a.function]), [[0, 'CTRE1', 'transfer'], [1, 'CTOK1', 'mint']]);
  assert.deepEqual(detail.actions[0].args, ['GBOB', '5']);
  assert.equal(one(`SELECT count(*)::int AS n FROM app.proposal_detail`).n, 8);
  assert.deepEqual(
    rows(`SELECT voter, support, weight FROM governance.proposal_votes WHERE proposal_id = 'p1' ORDER BY event_ledger, event_index`).map((v) => [v.voter, v.support, Number(v.weight)]),
    [['GALICE', 1, 5], ['GBOB', 0, 1], ['GCAROL', 2, 2]]
  );
  // Treasury.execute emits one Execute per call.
  assert.deepEqual(
    rows(`SELECT proposal_id, call_index, governor, target, function FROM treasury.calls ORDER BY call_index`),
    [
      { proposal_id: 'p1', call_index: 0, governor: 'CGOV1', target: 'CTRE1', function: 'transfer' },
      { proposal_id: 'p1', call_index: 1, governor: 'CGOV1', target: 'CTOK1', function: 'mint' }
    ]
  );
  assert.deepEqual(
    rows(`SELECT proposal_id, author, body, dao_id FROM governance.proposal_comments ORDER BY event_ledger, event_index`).map((r) => [r.author, r.body, r.dao_id]),
    [['GBOB', 'Shipped, thanks all', 'CTOK1'], ['GALICE', 'Withdrawn for now', 'CTOK1'], ['GCAROL', 'nul\uFFFDbyte', 'CTOK1']],
    'a NUL in free text becomes U+FFFD before the sink'
  );
  // The views cast through chain.jsonb_safe, so a NUL that reaches the table still reads.
  assert.equal(one(`SELECT chain.jsonb_safe('{"a":"x\\u0000y"}') ->> 'a' AS v`).v, 'x\uFFFDy');
});

test('auction: auctions carry their outcome and bid state; bids keep their comment', { skip }, () => {
  const auctions = rows(`SELECT token_id, duration_seconds, reserve_price, settled, cancelled, winner, settled_amount, highest_bidder, highest_bid, current_end_seconds, extension_count, closed_transaction_hash FROM auction.auctions ORDER BY token_id`);
  assert.deepEqual(auctions.map((a) => [a.token_id, a.duration_seconds, a.settled, a.cancelled, a.winner, a.settled_amount === null ? null : Number(a.settled_amount)]), [
    [7, 1000, true, false, 'GBID2', 30],
    [8, 1000, false, true, null, null],
    [9, 1000, true, false, null, 0],
    [10, 1000, false, false, null, null]
  ], 'an open auction is false/false, never NULL');
  assert.equal(one(`SELECT count(*)::int AS n FROM auction.auctions WHERE settled = false AND cancelled = false`).n, 1);
  assert.deepEqual(
    rows(`SELECT dao_id, token_id, settled, cancelled, highest_bidder FROM auction.current_auctions ORDER BY dao_id`),
    [{ dao_id: 'CTOK1', token_id: 10, settled: false, cancelled: false, highest_bidder: null }],
    'the newest auction per contract'
  );
  assert.deepEqual([auctions[0].highest_bidder, Number(auctions[0].highest_bid), auctions[0].current_end_seconds, auctions[0].extension_count], ['GBID3', 40, 2300, 1]);
  assert.deepEqual([auctions[2].highest_bidder, auctions[2].highest_bid, auctions[2].current_end_seconds, auctions[2].extension_count], [null, null, 2000, 0]);
  assert.equal(auctions[0].closed_transaction_hash, 'tx160-0');
  assert.equal(Number(auctions[0].reserve_price), 10);
  assert.deepEqual(rows(`SELECT bidder, amount, extended, comment FROM auction.bids ORDER BY event_ledger`).map((b) => [b.bidder, Number(b.amount), b.extended, b.comment]), [['GBID1', 20, false, 'gm'], ['GBID2', 30, true, null], ['GBID3', 40, false, null]]);
});

test('metadata: seeds', { skip }, () => {
  assert.deepEqual(rows(`SELECT token_id, num_properties, selections FROM metadata.token_seeds ORDER BY token_id`), [
    { token_id: 3, num_properties: 1, selections: [2] },
    { token_id: 4, num_properties: 1, selections: [1, 0] },
    { token_id: 5, num_properties: 1, selections: [1, 1] }
  ]);
  assert.equal(new Set(rows(`SELECT event_id FROM metadata.token_seeds WHERE token_id IN (4, 5)`).map((r) => r.event_id)).size, 1, 'batch rows share their event id');
  assert.equal(one(`SELECT to_regclass('metadata.profiles') AS v`).v, null, 'the profile is a column of manager.daos');
});

test('marketplace: pools by pool_id, secondary listings by token_id, sales', { skip }, () => {
  assert.deepEqual(
    rows(`SELECT pool_id, price, asset, size, stocked, sold, swept, in_stock, status, released FROM marketplace.pools ORDER BY pool_id`)
      .map((r) => [Number(r.pool_id), Number(r.price), r.asset, r.size, r.stocked, r.sold, r.swept, r.in_stock, r.status, r.released]),
    [
      [0, 100, 'CXLM', 3, 3, 1, 1, 1, 'closed', 0],
      [1, 100, 'CXLM', 5, 0, 0, 0, 0, 'closed', 5],
      [2, 100, 'CXLM', 2, 0, 0, 0, 0, 'open', null]
    ]
  );
  assert.deepEqual(
    rows(`SELECT pool_id, token_id FROM marketplace.pool_stock ORDER BY token_id`).map((r) => [Number(r.pool_id), Number(r.token_id)]),
    [[0, 20]],
    'the sold token went to its buyer (and is now relisted, not stock) and the swept one to the Treasury'
  );
  assert.deepEqual(
    rows(`SELECT token_id, status, buyer, seller, payment_asset, closed_transaction_hash FROM marketplace.secondary_listings ORDER BY token_id`),
    [
      { token_id: 10, status: 'cancelled', buyer: null, seller: 'GSELLER', payment_asset: 'CXLM', closed_transaction_hash: 'tx183-0' },
      { token_id: 11, status: 'open', buyer: null, seller: 'GSELLER', payment_asset: 'CXLM', closed_transaction_hash: null },
      { token_id: 12, status: 'purchased', buyer: 'GBUYER', seller: 'GSELLER', payment_asset: 'CXLM', closed_transaction_hash: 'tx186-0' },
      { token_id: 21, status: 'open', buyer: null, seller: 'GBUYER', payment_asset: 'CXLM', closed_transaction_hash: null }
    ]
  );
  assert.deepEqual(
    rows(`SELECT sale_type, pool_id, token_id, buyer, seller, price, fee, payment_asset FROM marketplace.sales ORDER BY event_ledger`)
      .map((r) => [r.sale_type, r.pool_id === null ? null : Number(r.pool_id), r.token_id, r.buyer, r.seller, Number(r.price), r.fee === null ? null : Number(r.fee), r.payment_asset]),
    [['pool', 0, 21, 'GBUYER', null, 100, null, 'CXLM'], ['secondary', null, 12, 'GBUYER', 'GSELLER', 100, 2, 'CXLM']]
  );
  assert.equal(one(`SELECT to_regclass('marketplace.primary_listings') AS v`).v, null, 'primary listings are gone');
  assert.deepEqual(
    rows(`SELECT token_id, author, body FROM marketplace.listing_comments`).map((r) => [Number(r.token_id), r.author, r.body]),
    [[11, 'GBUYER', 'Would you take 80?']]
  );
  const feed = rows(`SELECT kind, visibility, actor FROM app.activity_feed WHERE kind LIKE '%_commented' ORDER BY ledger_sequence, event_index`);
  assert.deepEqual(feed.map((r) => [r.kind, r.visibility, r.actor]), [
    ['governance.proposal_commented', 'governance', 'GBOB'],
    ['governance.proposal_commented', 'governance', 'GALICE'],
    ['governance.proposal_commented', 'governance', 'GCAROL'],
    ['marketplace.listing_commented', 'public', 'GBUYER']
  ]);
});

test('claims: lists, claims and claimers per ClaimMinter, including a failed assurance drive', { skip }, () => {
  assert.deepEqual(
    rows(`SELECT dao_id, contract_id, list_id, price, total, is_assurance, threshold_claimers, deadline, claimed, claimers, paid, escrowed, released, refunded FROM claims.lists ORDER BY dao_id, list_id`)
      .map((r) => ({ ...r, list_id: Number(r.list_id), price: Number(r.price), paid: Number(r.paid), escrowed: Number(r.escrowed), refunded: Number(r.refunded) })),
    [
      { dao_id: 'CTOK1', contract_id: 'CCLM1', list_id: 0, price: 50, total: 10, is_assurance: false, threshold_claimers: null, deadline: null, claimed: 4, claimers: 2, paid: 200, escrowed: 0, released: null, refunded: 0 },
      { dao_id: 'CTOK1', contract_id: 'CCLM1', list_id: 1, price: 0, total: 5, is_assurance: false, threshold_claimers: null, deadline: null, claimed: 0, claimers: 0, paid: 0, escrowed: 0, released: null, refunded: 0 },
      { dao_id: 'CTOK2', contract_id: 'CCLM2', list_id: 0, price: 25, total: 4, is_assurance: true, threshold_claimers: 3, deadline: 9000, claimed: 1, claimers: 1, paid: 25, escrowed: 25, released: null, refunded: 25 }
    ]
  );
  assert.deepEqual(
    rows(`SELECT claimer, amount, first_token_id, paid, escrowed, claimer_total FROM claims.claims WHERE dao_id = 'CTOK1' ORDER BY event_ledger, event_index`)
      .map((r) => [r.claimer, Number(r.amount), Number(r.first_token_id), Number(r.paid), r.escrowed, Number(r.claimer_total)]),
    [['GALICE', 2, 30, 100, false, 2], ['GALICE', 1, 33, 50, false, 3], ['GBOB', 1, 32, 50, false, 1]]
  );
  assert.deepEqual(
    rows(`SELECT dao_id, claimer, claimed, paid, escrowed, refunded FROM claims.claimers ORDER BY dao_id, claimer`)
      .map((r) => [r.dao_id, r.claimer, Number(r.claimed), Number(r.paid), Number(r.escrowed), Number(r.refunded)]),
    [['CTOK1', 'GALICE', 3, 150, 0, 0], ['CTOK1', 'GBOB', 1, 50, 0, 0], ['CTOK2', 'GCAROL', 1, 25, 25, 25]]
  );
});

test('module versions: the code each module runs, mirroring version()', { skip }, () => {
  assert.deepEqual(
    one(`SELECT token_wasm_hash, governor_wasm_hash, auction_wasm_hash, treasury_wasm_hash, metadata_wasm_hash, marketplace_wasm_hash, claims_wasm_hash FROM manager.dao_registry WHERE dao_id = 'CTOK1'`),
    { token_wasm_hash: 'a01', metadata_wasm_hash: 'a11', auction_wasm_hash: 'a21', governor_wasm_hash: 'a31', treasury_wasm_hash: 'a41', marketplace_wasm_hash: 'a51', claims_wasm_hash: 'a61' }
  );
  assert.deepEqual(
    one(`SELECT current_hash, current_version, storage_version, upgrade_count, last_upgraded_from_hash, last_upgraded_ledger, last_upgraded_tx_hash FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'auction'`),
    { current_hash: 'b20', current_version: '0.2.0', storage_version: 2, upgrade_count: 1, last_upgraded_from_hash: 'a20', last_upgraded_ledger: 117, last_upgraded_tx_hash: 'tx117-0' }
  );
  assert.deepEqual(
    one(`SELECT current_hash, current_version, storage_version, upgrade_count, last_upgraded_from_hash FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'token'`),
    { current_hash: 'a01', current_version: '0.1.0', storage_version: 1, upgrade_count: 0, last_upgraded_from_hash: null }
  );
  assert.equal(one(`SELECT current_version FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'governor'`).current_version, '0.1.0');
  assert.equal(one(`SELECT current_version FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'treasury'`).current_version, null, 'an unregistered hash has no version (on chain: ImplementationNotFound)');
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.module_versions WHERE dao_id = 'CTOK2'`).n, 7, 'the core four and three modules');
  assert.deepEqual(
    one(`SELECT current_hash, current_version, storage_version, upgrade_count FROM manager.module_versions WHERE dao_id = 'CTOK1' AND module_role = 'claims'`),
    { current_hash: 'c72', current_version: null, storage_version: 2, upgrade_count: 1 },
    'the ClaimMinter upgrades as a DAO module'
  );
  assert.deepEqual(
    one(`SELECT current_hash, registered FROM manager.module_versions WHERE module_contract = 'CVAULT'`),
    { current_hash: null, registered: false }
  );
});

test('activity feed: tenant resolution, platform fan-out and kinds', { skip }, () => {
  const feed = (where) => rows(`SELECT * FROM app.activity_feed WHERE ${where} ORDER BY ledger_sequence, event_index`);
  const perDao = ['dao_created', 'dao_launched', 'slug_claimed', 'pending_slug_updated', 'slug_changed', 'slug_released', 'module_created', 'assurance_opened'];
  const platform = ['upgrade_delay_changed', 'manager_upgraded', 'implementation_revoked'];
  assert.ok(
    feed(`contract_role = 'manager'`).every((r) => (perDao.includes(r.event_name) || platform.includes(r.event_name) ? r.dao_id !== null : r.dao_id === null)),
    'per-DAO manager events resolve to their DAO, platform ones to every DAO; deployment-wide ones have none'
  );
  assert.deepEqual(rows(`SELECT dao_id FROM app.activity_feed WHERE event_name = 'dao_launched' ORDER BY ledger_sequence`).map((r) => r.dao_id), ['CTOK1', 'CTOK4'], 'launch rows belong to their DAO feed');
  assert.deepEqual(
    rows(`SELECT event_name, dao_id FROM app.activity_feed WHERE event_name IN ('assurance_opened', 'slug_released', 'module_created') ORDER BY ledger_sequence`).map((r) => [r.event_name, r.dao_id]),
    [['assurance_opened', 'CTOK2'], ['module_created', 'CTOK3'], ['slug_released', 'CTOK2']]
  );
  assert.equal(one(`SELECT dao_id FROM app.activity_feed WHERE event_name = 'admin_changed' AND contract_role = 'manager'`).dao_id, null, 'deployment-wide Manager events have no DAO');
  assert.ok(feed(`contract_role = 'governor'`).every((r) => r.dao_id === 'CTOK1'));
  // ClaimMinter rows resolve through the registry, each to its own DAO (DAO 2's while still pending).
  assert.deepEqual(
    rows(`SELECT contract_id, dao_id, count(*)::int AS n FROM app.activity_feed WHERE contract_role = 'claims' GROUP BY contract_id, dao_id ORDER BY contract_id`),
    [{ contract_id: 'CCLM1', dao_id: 'CTOK1', n: 9 }, { contract_id: 'CCLM2', dao_id: 'CTOK2', n: 3 }]
  );
  assert.equal(one(`SELECT count(*)::int AS n FROM app.activity_feed_events WHERE contract_role = 'claims'`).n, 12);
  assert.equal(one(`SELECT count(*)::int AS n FROM app.activity_feed WHERE dao_id IS NULL AND contract_role = 'claims'`).n, 0, 'no ClaimMinter row is left without a DAO');

  // An external module's events belong to its DAO only while it is registered.
  assert.deepEqual(
    rows(`SELECT event_name, dao_id, kind, title, visibility FROM app.activity_feed WHERE contract_id = 'CVAULT'`),
    [{ event_name: 'vault_opened', dao_id: 'CTOK1', kind: 'module.vault_opened', title: 'Module event', visibility: 'admin' }],
    'vault_closed came after the unregistration'
  );
  assert.equal(one(`SELECT count(*)::int AS n FROM app.activity_feed_events WHERE contract_id = 'CVAULT'`).n, 2, 'the append-only stream still carries both');
  assert.equal(one(`SELECT count(*)::int AS n FROM manager.module_events WHERE contract_id = 'CVAULT'`).n, 1);

  // Platform events: one row per DAO that existed at the time (CTOK3 came later), unique activity ids.
  assert.deepEqual(
    rows(`SELECT dao_id, count(*)::int AS n FROM app.activity_feed WHERE event_name IN ('upgrade_delay_changed', 'manager_upgraded') GROUP BY dao_id ORDER BY dao_id`),
    [{ dao_id: 'CTOK1', n: 2 }, { dao_id: 'CTOK2', n: 2 }]
  );
  assert.deepEqual(
    rows(`SELECT dao_id, kind, visibility FROM app.activity_feed WHERE event_name = 'implementation_revoked' ORDER BY dao_id`),
    [{ dao_id: 'CTOK1', kind: 'manager.implementation_revoked', visibility: 'public' }],
    'a revoked implementation reaches only the DAOs running it'
  );
  assert.equal(one(`SELECT (count(*) = count(DISTINCT activity_id)) AS unique_ids FROM app.activity_feed`).unique_ids, true);
  assert.deepEqual(
    rows(`SELECT DISTINCT kind, visibility, summary FROM app.activity_feed WHERE event_name = 'upgrade_delay_changed' ORDER BY kind`),
    [{ kind: 'manager.upgrade_delay_changed', visibility: 'public', summary: 'Upgrade notice shortened from 720 to 120 ledgers, in force from ledger 880' }]
  );
  assert.deepEqual(
    one(`SELECT DISTINCT kind, visibility, summary FROM app.activity_feed WHERE event_name = 'manager_upgraded'`),
    { kind: 'manager.upgraded', visibility: 'public', summary: 'Manager upgraded to version 0.2.0 (was 0.1.0)' }
  );

  const kinds = rows(`SELECT DISTINCT kind FROM app.activity_feed WHERE contract_role = 'claims' ORDER BY kind`);
  assert.deepEqual(kinds.map((k) => k.kind), ['claims.admin_changed', 'claims.claimed', 'claims.launched', 'claims.list_opened', 'claims.migrated', 'claims.refunded', 'claims.upgraded']);
  const claim = rows(`SELECT actor, amount, token_id, visibility FROM app.activity_feed WHERE kind = 'claims.claimed' AND dao_id = 'CTOK1' ORDER BY ledger_sequence, event_index`)[0];
  assert.deepEqual([claim.actor, claim.amount, claim.token_id, claim.visibility], ['GALICE', '100', '30', 'public']);
  const upgradedFeed = one(`SELECT kind, visibility, summary FROM app.activity_feed WHERE event_name = 'upgraded' AND contract_role = 'auction'`);
  assert.deepEqual(upgradedFeed, { kind: 'auction.upgraded', visibility: 'public', summary: 'Contract upgraded to version 0.2.0 (a20 -> b20)' });
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'migrated' AND contract_role = 'auction'`).kind, 'auction.migrated');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'admin_changed' AND contract_role = 'manager'`).kind, 'manager.admin_changed');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'admin_changed' AND contract_role = 'token'`).kind, 'token.admin_changed');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'admin_proposal_cancelled'`).kind, 'manager.admin_proposal_cancelled');
  assert.deepEqual(rows(`SELECT DISTINCT visibility FROM app.activity_feed WHERE event_name = 'slug_claimed'`), [{ visibility: 'admin' }], 'the launch row tells the story; the slug claim is bookkeeping');
  const renamed = rows(`SELECT dao_id, visibility, summary FROM app.activity_feed WHERE event_name = 'slug_changed' ORDER BY event_index`);
  assert.deepEqual(renamed.map((r) => [r.dao_id, r.visibility]), [['CTOK1', 'public'], ['CTOK1', 'public']]);
  assert.equal(renamed[1].summary, 'Link changed to /dao/alpha-club (was /dao/dao-uno)');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'proposal_cancelled'`).kind, 'governance.proposal_cancelled');
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'listing_purchased'`).kind, 'marketplace.listing_purchased');
  assert.deepEqual(
    rows(`SELECT kind, visibility FROM app.activity_feed WHERE contract_role = 'marketplace' AND kind LIKE 'marketplace.pool_%' ORDER BY ledger_sequence, event_index`).map((r) => [r.kind, r.visibility]),
    [
      ['marketplace.pool_opened', 'public'], ['marketplace.pool_restocked', 'admin'], ['marketplace.pool_purchased', 'public'],
      ['marketplace.pool_opened', 'public'], ['marketplace.pool_closed', 'public'], ['marketplace.pool_closed', 'public'],
      ['marketplace.pool_swept', 'admin'], ['marketplace.pool_opened', 'public']
    ]
  );
  assert.deepEqual(
    rows(`SELECT kind, visibility, actor FROM app.activity_feed WHERE dao_id = 'CTOK1' AND kind IN ('token.transfers_lock_changed', 'token.dao_recovery_changed', 'token.dao_transfer', 'token.agent_transfer') ORDER BY ledger_sequence, event_index`)
      .map((r) => [r.kind, r.visibility, r.actor]),
    [
      ['token.agent_transfer', 'admin', 'GALICE'], ['token.transfers_lock_changed', 'public', 'CTRE1'],
      ['token.dao_recovery_changed', 'public', 'CTRE1'], ['token.dao_transfer', 'public', 'CTRE1']
    ]
  );
  assert.equal(one(`SELECT kind FROM app.activity_feed WHERE event_name = 'unpaused' AND dao_id = 'CTOK1'`).kind, 'auction.unpaused');
  assert.deepEqual(rows(`SELECT DISTINCT kind FROM app.activity_feed WHERE kind LIKE 'contract.%'`), [], 'every event has a module- or contract-specific kind');
  // Feed rows keep their position inside a ledger (filled by the trigger from the id).
  assert.deepEqual(
    rows(`SELECT event_index FROM app.activity_feed WHERE ledger_sequence = 120 ORDER BY event_index`).map((r) => r.event_index),
    Array.from({ length: 13 }, (_, i) => i)
  );
});

test('indexer status exposes progress without raw events', { skip }, () => {
  const status = one(`SELECT * FROM app.indexer_status`);
  assert.equal(status.deployment_id, DEPLOYMENT);
  assert.equal(status.latest_ledger, 312);
  assert.equal(status.event_count, events.length);
  const feed = one(`SELECT latest_ledger, last_hour_count FROM app.feed_status`);
  assert.deepEqual({ latest_ledger: feed.latest_ledger, last_hour_count: Number(feed.last_hour_count) }, { latest_ledger: 312, last_hour_count: events.length }, 'every fixture ledger is within 720 of the latest');
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
