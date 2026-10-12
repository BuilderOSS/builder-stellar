/**
 * Every event the contracts can emit goes through the real decoder and activity
 * transform once, with topics and data synthesized from the struct's field names,
 * under the role that emits it. This is the check that a new or renamed event is
 * decoded (every topic lands under its name), classified (a module-specific kind
 * and a title, never the contract.* / module.* fallback) and summarised without
 * holes. It replaces eyeballing the kind, title and summary maps event by event.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contractEventList, LIBRARY_EVENTS } from '../src/contract-events.mjs';

function loadInvoke(name) {
  const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
  return new Function(`${source}\nreturn invoke;`)();
}
const decode = loadInvoke('decoded-events.script.js');
const feed = loadInvoke('activity-feed.script.js');

// On chain the first topic is the struct name in snake_case (soroban-sdk #[contractevent]).
const snake = (name) => name.replace(/([A-Z])/g, (_, c, i) => (i ? '_' : '') + c.toLowerCase());

// Which role emits each OpenZeppelin library event.
const LIBRARY_ROLES = {
  Transfer: 'token', Mint: 'token', Approve: 'token', ApproveForAll: 'token',
  DelegateChanged: 'token', DelegateVotesChanged: 'token',
  ProposalCreated: 'governor', VoteCast: 'governor', ProposalExecuted: 'governor', ProposalCancelled: 'governor', QuorumChanged: 'governor',
  Paused: 'auction', Unpaused: 'auction'
};

// The kind prefix each role's rows carry (the governor's kinds are governance.*).
const KIND_PREFIX = { governor: 'governance' };

const ADDRESS_FIELDS = new Set([
  'admin', 'treasury', 'minter', 'authority', 'voter', 'proposer', 'bidder', 'buyer', 'seller', 'author',
  'recipient', 'deployer', 'launch_admin', 'approver', 'owner', 'operator', 'delegator', 'delegate',
  'from_delegate', 'to_delegate', 'changed_by', 'cancelled_by', 'governor', 'target', 'token', 'token_address',
  'current_admin', 'proposed_admin', 'cancelled_admin', 'old_admin', 'new_admin', 'from', 'to', 'winner',
  'payment_asset', 'payment_token', 'token_contract', 'treasury_contract'
]);
const BYTES_FIELDS = new Set(['proposal_id', 'wasm_hash', 'from_hash', 'to_hash', 'root', 'hash']);
const STRING_FIELDS = new Set([
  'name', 'symbol', 'slug', 'new_slug', 'old_slug', 'version', 'from_version', 'to_version', 'function',
  'tree_uri', 'renderer_base', 'body', 'comment', 'profile', 'description', 'uri', 'reason_text'
]);

/** A plausible XDR-JSON value for a field, from its name and the emitting role. */
function valueFor(field, role, position) {
  if (field === 'token_id' && role === 'minter') return { address: 'CTOKEN' };
  if (ADDRESS_FIELDS.has(field)) return { address: `G${field.toUpperCase().replace(/_/g, '')}` };
  if (BYTES_FIELDS.has(field)) return { bytes: 'abcdef0123456789' };
  if (STRING_FIELDS.has(field)) return { string: `${field}-value` };
  if (/^(modules|wasm_hashes)$/.test(field)) return { map: [{ key: { symbol: 'token' }, val: { address: 'CTOKEN' } }] };
  if (/^(minters|targets|functions|args|selections|recipients|amounts)$/.test(field)) return { vec: [] };
  if (/^(started|opened|enabled|old_enabled|launch_auction|launch_marketplace|is_live)$/.test(field)) return { bool: true };
  if (/amount|price|weight|votes|fee|quorum|threshold|increment/.test(field)) return { i128: String(100 + position) };
  return { u32: 1 + position };
}

function synthesize({ name, role, topics, data }) {
  const topicValues = topics.map((field, i) => valueFor(field, role, i));
  const dataMap = { map: data.map((field, i) => ({ key: { symbol: field }, val: valueFor(field, role, i) })) };
  return decode({
    event_id: `manager:CMANAGER:1-tx-op-0-event-0`,
    deployment_id: 'manager:CMANAGER',
    contract_id: `C${role.toUpperCase()}`,
    contract_role: role,
    topics: JSON.stringify([{ symbol: snake(name) }, ...topicValues]),
    data: JSON.stringify(dataMap),
    transaction_hash: 'tx',
    transaction_successful: true,
    ledger_sequence: 1,
    transaction_index: 0,
    operation_index: null,
    event_index: null,
    ledger_closed_at: '1791475282000'
  });
}

const cases = [
  ...contractEventList().map((e) => ({ name: e.name, role: e.contract, topics: e.topics, data: e.data })),
  ...Object.entries(LIBRARY_EVENTS).map(([name, e]) => ({ name, role: LIBRARY_ROLES[name], topics: e.topics, data: e.data }))
];

test('every library event has an emitting role', () => {
  for (const name of Object.keys(LIBRARY_EVENTS)) assert.ok(LIBRARY_ROLES[name], `${name}: add it to LIBRARY_ROLES`);
});

for (const c of cases) {
  test(`${c.role}:${c.name} decodes, classifies and summarises cleanly`, () => {
    const decoded = synthesize(c);
    assert.ok(decoded, 'decoder returned a row');
    assert.equal(decoded.event_name, snake(c.name));
    assert.equal(decoded.contract_role, c.role, 'the pipeline role is kept');
    const topics = JSON.parse(decoded.topics);
    for (const field of c.topics) {
      assert.ok(topics[field] !== undefined && topics[field] !== null && topics[field] !== '', `topic ${field} is decoded under its name`);
    }
    const args = JSON.parse(decoded.args);
    for (const field of c.data) assert.ok(field in args, `data field ${field} is decoded under its name`);

    const row = feed(decoded);
    assert.ok(row, 'activity transform returned a row');
    const prefix = KIND_PREFIX[c.role] || c.role;
    assert.ok(row.kind.startsWith(`${prefix}.`), `${c.name}: kind ${row.kind} should start with ${prefix}. (contract.* / module.* is the fallback)`);
    assert.notEqual(row.title, c.name, `${c.name}: title is the raw event name (missing from titleMap)`);
    assert.ok(['public', 'governance', 'admin', 'system'].includes(row.visibility), `visibility ${row.visibility}`);
    for (const hole of ['undefined', '[object Object]', 'unknown', 'NaN']) {
      assert.ok(!row.summary.includes(hole), `${c.name}: summary "${row.summary}" has a hole (${hole})`);
    }
    assert.equal(row.operation_index, null, 'positions stay NULL for the database trigger');
    // Every address the event carries is searchable in `addresses` (accounts and contracts alike).
    const addresses = JSON.parse(row.addresses);
    for (const field of [...c.topics, ...c.data]) {
      if (!ADDRESS_FIELDS.has(field)) continue;
      assert.ok(addresses.includes(topics[field] ?? args[field]), `${c.name}: address field ${field} is missing from addresses`);
    }
    // The actor is the account that acted: the caller before the subject or a module contract.
    const fields = [...c.topics, ...c.data];
    const value = (f) => topics[f] ?? args[f];
    if (c.name === 'DaoLaunched') assert.equal(row.actor, '', 'DaoLaunched names only contracts');
    else if (fields.includes('changed_by')) assert.equal(row.actor, value('changed_by'), `${c.name}: changed_by is the actor`);
    else if (fields.includes('admin')) assert.equal(row.actor, value('admin'), `${c.name}: admin is the actor`);
  });
}
