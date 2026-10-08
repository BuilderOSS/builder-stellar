/**
 * Ground truth for what the contracts emit, parsed from the Rust sources.
 *
 * Used by `pnpm validate` and test/contract-alignment.test.mjs so the decoder's
 * topic names can never silently drift from the contracts.
 */
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(moduleDir, '..', '..', '..');

// OpenZeppelin stellar-contracts (rev pinned in Cargo.toml) events emitted by
// our contracts. Topic order is the on-chain order after the event-name symbol.
export const LIBRARY_EVENTS = {
  Transfer: { topics: ['from', 'to'], data: ['token_id'] },
  Mint: { topics: ['to'], data: ['token_id'] },
  Approve: { topics: ['approver', 'token_id'], data: ['approved', 'live_until_ledger'] },
  ApproveForAll: { topics: ['owner'], data: ['operator', 'live_until_ledger'] },
  DelegateChanged: { topics: ['delegator'], data: ['from_delegate', 'to_delegate'] },
  DelegateVotesChanged: { topics: ['delegate'], data: ['previous_votes', 'new_votes'] },
  ProposalCreated: { topics: ['proposal_id', 'proposer'], data: ['targets', 'functions', 'args', 'vote_snapshot', 'vote_end', 'description'] },
  VoteCast: { topics: ['voter', 'proposal_id'], data: ['vote_type', 'weight', 'reason'] },
  ProposalExecuted: { topics: ['proposal_id'], data: [] },
  ProposalCancelled: { topics: ['proposal_id'], data: [] },
  Paused: { topics: [], data: [] },
  Unpaused: { topics: [], data: [] },
  OwnershipTransfer: { topics: [], data: ['old_owner', 'new_owner', 'live_until_ledger'] },
  OwnershipTransferCompleted: { topics: [], data: ['new_owner'] },
  OwnershipRenounced: { topics: [], data: ['old_owner'] }
};

/**
 * Parse every #[contractevent] struct into a flat list of { contract, name, topics, data }.
 * Names are NOT unique across contracts: each module emits its own `Launched`
 * struct (token minters, auction started, marketplace opened, ...). The unique key
 * is (contract, name); the decoder keys on the event name only, so same-named
 * events must agree on topics (enforced by contractEvents()).
 */
export function contractEventList() {
  const list = [];
  const contractsDir = join(repoRoot, 'contracts');
  for (const dir of readdirSync(contractsDir).sort()) {
    const file = join(contractsDir, dir, 'src', 'events.rs');
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^#\[contractevent/.test(lines[i])) continue;
      let j = i + 1;
      while (j < lines.length && !/^pub struct /.test(lines[j])) j += 1;
      const name = lines[j].match(/^pub struct (\w+)/)[1];
      const topics = [];
      const data = [];
      if (!/\{\s*\}\s*$/.test(lines[j])) {
        for (j += 1; j < lines.length && !/^\}/.test(lines[j]); j += 1) {
          if (/#\[topic\]/.test(lines[j])) {
            topics.push(lines[j + 1].match(/pub (\w+):/)[1]);
            j += 1;
          } else if (/^\s+pub \w+:/.test(lines[j])) {
            data.push(lines[j].match(/pub (\w+):/)[1]);
          }
        }
      }
      list.push({ contract: dir, name, topics, data });
    }
  }
  return list;
}

/** (contract, name) -> { contract, name, topics, data }; keys look like `token:Launched`. */
export function contractEventsByContract() {
  const events = {};
  for (const event of contractEventList()) {
    const key = `${event.contract}:${event.name}`;
    assert.ok(!events[key], `${key} is defined twice in one contract`);
    events[key] = event;
  }
  return events;
}

/**
 * name -> { contract, contracts, topics, data }. Same-named events in different
 * contracts must share their topic list (the decoder's topicNames is by name);
 * `data` is the first contract's data fields, `dataByContract` has every variant.
 */
export function contractEvents() {
  const events = {};
  for (const { contract, name, topics, data } of contractEventList()) {
    if (events[name]) {
      assert.deepEqual(events[name].topics, topics, `${name} is defined with different topics in ${events[name].contracts.join(', ')} and ${contract}`);
      events[name].contracts.push(contract);
      events[name].dataByContract[contract] = data;
    } else {
      events[name] = { contract, contracts: [contract], topics, data, dataByContract: { [contract]: data } };
    }
  }
  return events;
}

/** Evaluate the decoder's topicNames literal. */
export function decoderTopicNames() {
  const source = readFileSync(join(moduleDir, 'decoded-events.script.js'), 'utf8');
  const start = source.indexOf('var topicNames = {');
  const end = source.indexOf('\n  };', start);
  assert.ok(start > 0 && end > start, 'topicNames block not found in decoder');
  return new Function(`return ${source.slice(start + 'var topicNames = '.length, end + 4)}`)();
}

/** name -> { topics, data } for every event the deployment can emit (contracts + libraries). */
export function allEvents() {
  return {
    ...LIBRARY_EVENTS,
    ...Object.fromEntries(Object.entries(contractEvents()).map(([name, e]) => [name, { topics: e.topics, data: e.data }]))
  };
}

/** Returns a list of human-readable drift problems; empty when aligned. */
export function findDecoderDrift() {
  const decoder = decoderTopicNames();
  const problems = [];
  const expected = {
    ...Object.fromEntries(Object.entries(contractEvents()).map(([name, e]) => [name, { topics: e.topics, source: e.contracts.join('+') }])),
    ...Object.fromEntries(Object.entries(LIBRARY_EVENTS).map(([name, e]) => [name, { topics: e.topics, source: 'library' }]))
  };
  for (const [name, { topics, source }] of Object.entries(expected)) {
    if (!(name in decoder)) problems.push(`${source}.${name}: missing from decoder`);
    else if (JSON.stringify(decoder[name]) !== JSON.stringify(topics)) {
      problems.push(`${source}.${name}: decoder ${JSON.stringify(decoder[name])} != ${JSON.stringify(topics)}`);
    }
  }
  for (const name of Object.keys(decoder)) {
    if (!(name in expected)) problems.push(`decoder.${name}: not emitted by any contract or library`);
  }
  return problems;
}
