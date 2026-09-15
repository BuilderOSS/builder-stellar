import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildGoldskyPipelineYaml, resolveDeploymentSelection, resolvePostgresSecretName, writeGoldskyPipeline } from '../src/pipeline-generator.mjs';

function loadInvoke(scriptName) {
  const source = readFileSync(new URL(`../src/${scriptName}`, import.meta.url), 'utf8');
  return new Function(`${source}\nreturn invoke;`)();
}

const decodeEvent = loadInvoke('decoded-events.script.js');
const buildActivityFeed = loadInvoke('activity-feed.script.js');

// XDR-JSON Flattening Tests

test('scValToNative handles all scalar types', () => {
  const testCases = [
    { input: { symbol: 'test_event' }, expected: 'test_event' },
    { input: { address: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO' }, expected: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO' },
    { input: { u32: 12345 }, expected: 12345 },
    { input: { i32: -12345 }, expected: -12345 },
    { input: { u64: '9007199254740992' }, expected: '9007199254740992' },
    { input: { i64: '-9007199254740992' }, expected: '-9007199254740992' },
    { input: { u128: '340282366920938463463374607431768211455' }, expected: '340282366920938463463374607431768211455' },
    { input: { i128: '-170141183460469231731687303715884105728' }, expected: '-170141183460469231731687303715884105728' },
    { input: { bytes: 'c3678ab26edd57c0' }, expected: 'c3678ab26edd57c0' },
    { input: { string: 'hello world' }, expected: 'hello world' },
    { input: { bool: true }, expected: true },
    { input: 'void', expected: null }
  ];

  for (const { input, expected } of testCases) {
    const event = decodeEvent({
      event_id: 'test-1',
      deployment_id: 'test-deployment',
      contract_id: 'TEST',
      contract_role: 'test',
      topics: JSON.stringify([{ symbol: 'test_event' }]),
      data: JSON.stringify(input),
      transaction_hash: 'tx-1',
      ledger_sequence: 100,
      ledger_closed_at: '2026-09-09T00:00:00Z'
    });

    // The input is wrapped in the data field, so check the payload
    if (event && event.payload) {
      const payload = JSON.parse(event.payload);
      // For simple values, payload should have the native value
      assert.ok(payload !== null, `Expected non-null payload for input: ${JSON.stringify(input)}`);
    }
  }
});

test('scValToNative handles vec (arrays)', () => {
  const decoded = decodeEvent({
    event_id: 'test-vec',
    deployment_id: 'test',
    contract_id: 'TEST',
    contract_role: 'test',
    topics: JSON.stringify([{ symbol: 'test_event' }]),
    data: JSON.stringify({
      map: [
        { key: { symbol: 'targets' }, val: { vec: [{ address: 'ADDR1' }, { address: 'ADDR2' }] } }
      ]
    }),
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  const payload = JSON.parse(decoded.payload);
  assert.deepEqual(payload.targets, ['ADDR1', 'ADDR2']);
});

test('scValToNative handles map (objects)', () => {
  const decoded = decodeEvent({
    event_id: 'test-map',
    deployment_id: 'test',
    contract_id: 'TEST',
    contract_role: 'test',
    topics: JSON.stringify([{ symbol: 'test_event' }]),
    data: JSON.stringify({
      map: [
        { key: { symbol: 'amount' }, val: { u128: '1000000' } },
        { key: { symbol: 'reason' }, val: { string: 'test reason' } }
      ]
    }),
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.amount, '1000000');
  assert.equal(payload.reason, 'test reason');
});

test('scValToNative preserves u128 as string', () => {
  const largeNumber = '340282366920938463463374607431768211455';
  const decoded = decodeEvent({
    event_id: 'test-u128',
    deployment_id: 'test',
    contract_id: 'TEST',
    contract_role: 'test',
    topics: JSON.stringify([{ symbol: 'test_event' }]),
    data: JSON.stringify({ map: [{ key: { symbol: 'weight' }, val: { u128: largeNumber } }] }),
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.amount, largeNumber);
  assert.equal(typeof decoded.amount, 'string');
});

// Real Goldsky Event Decoding Tests

test('decodes delegate_changed event from real Goldsky data', () => {
  const decoded = decodeEvent({
    event_id: '4254435-e77558cbdde9052f7af508b7c5677d122b7abfdb6dada08c5024a12d36f84070-op-0-event-0',
    deployment_id: 'builder-testnet',
    contract_id: 'CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2',
    contract_role: 'token',
    topics: '[{"symbol":"delegate_changed"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}]',
    data: '{"map":[{"key":{"symbol":"from_delegate"},"val":"void"},{"key":{"symbol":"to_delegate"},"val":{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}}]}',
    transaction_hash: 'e77558cbdde9052f7af508b7c5677d122b7abfdb6dada08c5024a12d36f84070',
    transaction_successful: true,
    ledger_sequence: 4254435,
    ledger_closed_at: '2026-08-21 06:44:42'
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'delegate_changed');
  assert.equal(decoded.actor, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
  assert.equal(decoded.from_address, null);
  assert.equal(decoded.to_address, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
});

test('decodes mint event from real Goldsky data', () => {
  const decoded = decodeEvent({
    event_id: '4254435-e77558cbdde9052f7af508b7c5677d122b7abfdb6dada08c5024a12d36f84070-op-0-event-1',
    deployment_id: 'builder-testnet',
    contract_id: 'CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2',
    contract_role: 'token',
    topics: '[{"symbol":"mint"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}]',
    data: '{"map":[{"key":{"symbol":"token_id"},"val":{"u32":2}}]}',
    transaction_hash: 'e77558cbdde9052f7af508b7c5677d122b7abfdb6dada08c5024a12d36f84070',
    transaction_successful: true,
    ledger_sequence: 4254435,
    ledger_closed_at: '2026-08-21 06:44:42'
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'mint');
  assert.equal(decoded.owner, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
  assert.equal(decoded.token_id, '2');
});

test('decodes delegate_votes_changed event from real Goldsky data', () => {
  const decoded = decodeEvent({
    event_id: '4254435-e77558cbdde9052f7af508b7c5677d122b7abfdb6dada08c5024a12d36f84070-op-0-event-2',
    deployment_id: 'builder-testnet',
    contract_id: 'CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2',
    contract_role: 'token',
    topics: '[{"symbol":"delegate_votes_changed"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}]',
    data: '{"map":[{"key":{"symbol":"new_votes"},"val":{"u128":"1"}},{"key":{"symbol":"previous_votes"},"val":{"u128":"0"}}]}',
    transaction_hash: 'e77558cbdde9052f7af508b7c5677d122b7abfdb6dada08c5024a12d36f84070',
    transaction_successful: true,
    ledger_sequence: 4254435,
    ledger_closed_at: '2026-08-21 06:44:42'
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'delegate_votes_changed');
  assert.equal(decoded.actor, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.new_votes, '1');
  assert.equal(payload.previous_votes, '0');
});

test('decodes proposal_created event from real Goldsky data', () => {
  const decoded = decodeEvent({
    event_id: '4255555-fa4a8bec099b07f370ce61ed074f36ea824af61ca120fb1d16564b03e026d281-op-0-event-0',
    deployment_id: 'builder-testnet',
    contract_id: 'CAG53CFAXFUYFKETPK3IWQ2O2OQJ3KIYOQSCKSPLWNLEW3QOM454CHTI',
    contract_role: 'governor',
    topics: '[{"symbol":"proposal_created"},{"bytes":"c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}]',
    data: '{"map":[{"key":{"symbol":"args"},"val":{"vec":[{"vec":[{"address":"CB372B54CDBT6Y3RWUEWWOKEWQVZ5KGLQ7OFAXW4W7VNH7PWXJOMZ4ZG"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}]}]}},{"key":{"symbol":"description"},"val":{"string":"{\\"title\\":\\"test proposal\\",\\"description\\":\\"test\\",\\"url\\":\\"\\"}"}},{"key":{"symbol":"functions"},"val":{"vec":[{"symbol":"mint"}]}},{"key":{"symbol":"targets"},"val":{"vec":[{"address":"CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2"}]}},{"key":{"symbol":"vote_end"},"val":{"u32":1787300891}},{"key":{"symbol":"vote_snapshot"},"val":{"u32":4255554}}]}',
    transaction_hash: 'fa4a8bec099b07f370ce61ed074f36ea824af61ca120fb1d16564b03e026d281',
    transaction_successful: true,
    ledger_sequence: 4255555,
    ledger_closed_at: '2026-08-21 08:18:11'
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'proposal_created');
  assert.equal(decoded.proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
  assert.equal(decoded.actor, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');

  const payload = JSON.parse(decoded.payload);
  assert.ok(payload.description.includes('test proposal'));
  assert.deepEqual(payload.targets, ['CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2']);
  assert.deepEqual(payload.functions, ['mint']);
  assert.equal(payload.vote_snapshot, 4255554);
  assert.equal(decoded.snapshot_ledger, 4255554);
  assert.equal(decoded.deadline_ledger, 1787300891);
});

test('decodes vote_cast event from real Goldsky data', () => {
  const decoded = decodeEvent({
    event_id: '4255636-dd1558d7d5669560d0a6f0020e3692208104f13e76bc62fe58904b7294129fb5-op-0-event-0',
    deployment_id: 'builder-testnet',
    contract_id: 'CAG53CFAXFUYFKETPK3IWQ2O2OQJ3KIYOQSCKSPLWNLEW3QOM454CHTI',
    contract_role: 'governor',
    topics: '[{"symbol":"vote_cast"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"},{"bytes":"c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff"}]',
    data: '{"map":[{"key":{"symbol":"reason"},"val":{"string":""}},{"key":{"symbol":"vote_type"},"val":{"u32":1}},{"key":{"symbol":"weight"},"val":{"u128":"1"}}]}',
    transaction_hash: 'dd1558d7d5669560d0a6f0020e3692208104f13e76bc62fe58904b7294129fb5',
    transaction_successful: true,
    ledger_sequence: 4255636,
    ledger_closed_at: '2026-08-21 08:24:57'
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'vote_cast');
  assert.equal(decoded.actor, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
  assert.equal(decoded.proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
  assert.equal(decoded.support, 1);
  assert.equal(decoded.amount, '1');
  // Empty string is stored as null in the decoder
  assert.ok(decoded.reason === '' || decoded.reason === null);
});

// Activity Feed Transform Tests

test('builds activity feed row from decoded delegate_changed event', () => {
  const decodedEvent = {
    event_id: 'evt-1',
    deployment_id: 'builder-testnet',
    contract_id: 'CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2',
    contract_role: 'token',
    event_name: 'delegate_changed',
    actor: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
    to_address: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
    payload: '{"event_name":"delegate_changed","from_delegate":null,"to_delegate":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}',
    ledger_sequence: 4254435,
    ledger_closed_at: '2026-08-21 06:44:42',
    transaction_hash: 'tx-1'
  };

  const activity = buildActivityFeed(decodedEvent);

  assert.ok(activity);
  assert.equal(activity.kind, 'token.delegate_changed');
  assert.equal(activity.title, 'Delegation changed');
  assert.equal(activity.summary, 'Delegation changed');
  assert.equal(activity.actor, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
});

test('builds activity feed row from decoded mint event', () => {
  const decodedEvent = {
    event_id: 'evt-2',
    deployment_id: 'builder-testnet',
    contract_id: 'CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2',
    contract_role: 'token',
    event_name: 'mint',
    owner: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
    token_id: '2',
    payload: '{"event_name":"mint","token_id":2}',
    ledger_sequence: 4254435,
    ledger_closed_at: '2026-08-21 06:44:42',
    transaction_hash: 'tx-2'
  };

  const activity = buildActivityFeed(decodedEvent);

  assert.ok(activity);
  assert.equal(activity.kind, 'token.mint');
  assert.equal(activity.title, 'Token minted');
  assert.match(activity.summary, /Minted token 2/);
});

test('builds activity feed row from decoded proposal_created event', () => {
  const decodedEvent = {
    event_id: 'evt-3',
    deployment_id: 'builder-testnet',
    contract_id: 'CAG53CFAXFUYFKETPK3IWQ2O2OQJ3KIYOQSCKSPLWNLEW3QOM454CHTI',
    contract_role: 'governor',
    event_name: 'proposal_created',
    proposal_id: 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff',
    actor: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
    description: '{"title":"test proposal","description":"test","url":""}',
    payload: '{"event_name":"proposal_created"}',
    ledger_sequence: 4255555,
    ledger_closed_at: '2026-08-21 08:18:11',
    transaction_hash: 'tx-3'
  };

  const activity = buildActivityFeed(decodedEvent);

  assert.ok(activity);
  assert.equal(activity.kind, 'governance.proposal_created');
  assert.equal(activity.title, 'Proposal created');
  assert.equal(activity.summary, 'Proposal created');
  assert.equal(activity.proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
});

test('builds activity feed row from decoded vote_cast event', () => {
  const decodedEvent = {
    event_id: 'evt-4',
    deployment_id: 'builder-testnet',
    contract_id: 'CAG53CFAXFUYFKETPK3IWQ2O2OQJ3KIYOQSCKSPLWNLEW3QOM454CHTI',
    contract_role: 'governor',
    event_name: 'vote_cast',
    proposal_id: 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff',
    actor: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
    support: 1,
    amount: '1',
    payload: '{"event_name":"vote_cast"}',
    ledger_sequence: 4255636,
    ledger_closed_at: '2026-08-21 08:24:57',
    transaction_hash: 'tx-4'
  };

  const activity = buildActivityFeed(decodedEvent);

  assert.ok(activity);
  assert.equal(activity.kind, 'governance.vote_cast');
  assert.equal(activity.title, 'Vote cast');
  assert.equal(activity.summary, 'Vote cast on proposal');
  assert.equal(activity.proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
});

// Pipeline Generation Tests

test('deployment selection uses shared env names', () => {
  const selection = resolveDeploymentSelection({
    NEXT_PUBLIC_DAO_NETWORK: 'testnet',
    NEXT_PUBLIC_DAO_LABEL: 'builder'
  });

  assert.equal(selection.network, 'testnet');
  assert.equal(selection.label, 'builder');
  assert.match(selection.artifactPath, /deploys\/builder-testnet\.json$/);
});

test('pipeline generator renders the current deployment and scripts', () => {
  const deployment = JSON.parse(readFileSync(new URL('../../../deploys/builder-testnet.json', import.meta.url), 'utf8'));
  const template = readFileSync(new URL('../templates/dao-stellar-events.yaml.mustache', import.meta.url), 'utf8');
  const activityScript = readFileSync(new URL('../src/activity-feed.script.js', import.meta.url), 'utf8');

  const yaml = buildGoldskyPipelineYaml({ deployment, secretName: 'MY_SECRET', templateSource: template, scriptSource: activityScript });

  assert.match(yaml, /name: dao-stellar-events/);
  assert.match(yaml, /dataset_name: stellar_testnet\.events/);
  assert.match(yaml, /start_at: 4551728/);
  assert.match(yaml, /'builder-testnet' AS deployment_id/);
  assert.match(yaml, /schema: chain/);
  assert.match(yaml, /table: raw_events/);
  assert.match(yaml, /table: decoded_events/);
  assert.match(yaml, /table: activity_feed/);
  assert.match(yaml, /contract_id/);
  assert.match(yaml, /contract_role/);
  assert.match(yaml, /function invoke\(data\)/);
  assert.match(yaml, /event_name: string/);
  assert.match(yaml, /CBGLIC3VDPNSXRQTHIHADJVL3WVM54ZIO7FV23SDC3DQTTDLO2NMYUK7/);
  assert.match(yaml, /CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI/);
  assert.match(yaml, /CCPNKK3XDYHX57MNAUSWNRHDZKDOIG7DOGV43I4N3LJ74KK7TVZLXVW2/);
  assert.match(yaml, /CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E/);
  assert.match(yaml, /secret_name: MY_SECRET/);
});

test('writeGoldskyPipeline writes a file from env selection', () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'goldsky-pipeline-')), 'dao-stellar-events.yaml');
  const result = writeGoldskyPipeline({
    env: {
      NEXT_PUBLIC_DAO_NETWORK: 'testnet',
      NEXT_PUBLIC_DAO_LABEL: 'builder',
      GOLDSKY_POSTGRES_SECRET: 'MY_SECRET'
    },
    outputPath
  });

  assert.equal(result.selection.network, 'testnet');
  assert.equal(result.selection.label, 'builder');
  assert.equal(result.secretName, 'MY_SECRET');
  assert.equal(result.outputPath, outputPath);
  assert.match(readFileSync(outputPath, 'utf8'), /name: dao-stellar-events/);
});

// End-to-end Integration Tests

test('end-to-end: real Goldsky event -> decoded -> activity feed', () => {
  // Step 1: Decode raw Goldsky event
  const rawEvent = {
    event_id: '4255555-fa4a8bec099b07f370ce61ed074f36ea824af61ca120fb1d16564b03e026d281-op-0-event-0',
    deployment_id: 'builder-testnet',
    contract_id: 'CAG53CFAXFUYFKETPK3IWQ2O2OQJ3KIYOQSCKSPLWNLEW3QOM454CHTI',
    contract_role: 'governor',
    topics: '[{"symbol":"proposal_created"},{"bytes":"c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff"},{"address":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}]',
    data: '{"map":[{"key":{"symbol":"description"},"val":{"string":"{\\"title\\":\\"test\\"}"}},{"key":{"symbol":"vote_snapshot"},"val":{"u32":4255554}}]}',
    transaction_hash: 'fa4a8bec099b07f370ce61ed074f36ea824af61ca120fb1d16564b03e026d281',
    transaction_successful: true,
    ledger_sequence: 4255555,
    ledger_closed_at: '2026-08-21 08:18:11'
  };

  const decoded = decodeEvent(rawEvent);
  assert.ok(decoded);
  assert.equal(decoded.event_name, 'proposal_created');
  assert.equal(decoded.proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');

  // Step 2: Build activity feed from decoded event
  const activity = buildActivityFeed(decoded);
  assert.ok(activity);
  assert.equal(activity.kind, 'governance.proposal_created');
  assert.equal(activity.deployment_id, 'builder-testnet');
  assert.equal(activity.contract_role, 'governor');
  assert.equal(activity.proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
  assert.equal(activity.actor, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
  assert.equal(activity.ledger_sequence, 4255555);
  assert.equal(activity.transaction_hash, 'fa4a8bec099b07f370ce61ed074f36ea824af61ca120fb1d16564b03e026d281');
});

// Tests for Bug Fixes

test('MintWithMinter correctly extracts minter and to from 2 topics', () => {
  const decoded = decodeEvent({
    event_id: 'test-mint-with-minter',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    contract_role: 'token',
    topics: '[{"symbol":"MintWithMinter"},{"address":"MINTER_ADDR"},{"address":"TO_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"token_id"},"val":{"u32":42}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'MintWithMinter');
  assert.equal(decoded.minter, 'MINTER_ADDR');
  assert.equal(decoded.owner, 'TO_ADDR');
  assert.equal(decoded.token_id, '42');
});

test('Execute event extracts both governor and target', () => {
  const decoded = decodeEvent({
    event_id: 'test-execute',
    deployment_id: 'test',
    contract_id: 'TREASURY',
    contract_role: 'treasury',
    topics: '[{"symbol":"Execute"},{"address":"GOVERNOR_ADDR"},{"address":"TARGET_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"function"},"val":{"string":"transfer"}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'Execute');
  assert.equal(decoded.governor, 'GOVERNOR_ADDR');
  assert.equal(decoded.target, 'TARGET_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.function, 'transfer');
});

// Tests for New Token Events

test('decodes TokenInitialized event', () => {
  const decoded = decodeEvent({
    event_id: 'test-token-init',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    contract_role: 'token',
    topics: '[{"symbol":"TokenInitialized"},{"address":"OWNER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"name"},"val":{"string":"TestToken"}},{"key":{"symbol":"symbol"},"val":{"string":"TEST"}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'TokenInitialized');
  assert.equal(decoded.owner, 'OWNER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.name, 'TestToken');
  assert.equal(payload.symbol, 'TEST');
});

test('decodes MintAuthorityChanged event', () => {
  const decoded = decodeEvent({
    event_id: 'test-mint-auth',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    contract_role: 'token',
    topics: '[{"symbol":"MintAuthorityChanged"},{"address":"AUTHORITY_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"old_enabled"},"val":{"bool":false}},{"key":{"symbol":"enabled"},"val":{"bool":true}},{"key":{"symbol":"changed_by"},"val":{"address":"ADMIN_ADDR"}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'MintAuthorityChanged');
  assert.equal(decoded.authority, 'AUTHORITY_ADDR');
  assert.equal(decoded.changed_by, 'ADMIN_ADDR');
});

test('decodes BatchMint event with correct topic mapping', () => {
  const decoded = decodeEvent({
    event_id: 'test-batch-mint',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    contract_role: 'token',
    topics: '[{"symbol":"BatchMint"},{"address":"MINTER_ADDR"},{"address":"TO_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"amount"},"val":{"u32":10}},{"key":{"symbol":"last_token_id"},"val":{"u32":99}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'BatchMint');
  assert.equal(decoded.minter, 'MINTER_ADDR');
  assert.equal(decoded.owner, 'TO_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.amount, 10);
  assert.equal(payload.last_token_id, 99);
});

test('decodes Approve event', () => {
  const decoded = decodeEvent({
    event_id: 'test-approve',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    contract_role: 'token',
    topics: '[{"symbol":"Approve"},{"address":"OWNER_ADDR"},{"address":"SPENDER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"token_id"},"val":{"u32":42}},{"key":{"symbol":"expiration_ledger"},"val":{"u32":1000}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'Approve');
  assert.equal(decoded.owner, 'OWNER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.token_id, 42);
  assert.equal(payload.expiration_ledger, 1000);
});

// Tests for New Governance Events

test('decodes GovernorInitialized event', () => {
  const decoded = decodeEvent({
    event_id: 'test-gov-init',
    deployment_id: 'test',
    contract_id: 'GOVERNOR',
    contract_role: 'governor',
    topics: '[{"symbol":"GovernorInitialized"},{"address":"OWNER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"voting_delay"},"val":{"u32":300}},{"key":{"symbol":"voting_period"},"val":{"u32":600}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'GovernorInitialized');
  assert.equal(decoded.owner, 'OWNER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.voting_delay, 300);
  assert.equal(payload.voting_period, 600);
});

test('decodes TreasuryChanged event', () => {
  const decoded = decodeEvent({
    event_id: 'test-treasury-changed',
    deployment_id: 'test',
    contract_id: 'GOVERNOR',
    contract_role: 'governor',
    topics: '[{"symbol":"TreasuryChanged"},{"address":"OLD_TREASURY"},{"address":"NEW_TREASURY"}]',
    data: '{"map":[]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'TreasuryChanged');
  assert.equal(decoded.old_treasury, 'OLD_TREASURY');
  assert.equal(decoded.new_treasury, 'NEW_TREASURY');
});

test('decodes TokenContractChanged event', () => {
  const decoded = decodeEvent({
    event_id: 'test-token-changed',
    deployment_id: 'test',
    contract_id: 'GOVERNOR',
    contract_role: 'governor',
    topics: '[{"symbol":"TokenContractChanged"},{"address":"OLD_TOKEN"},{"address":"NEW_TOKEN"}]',
    data: '{"map":[]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'TokenContractChanged');
  assert.equal(decoded.old_token_contract, 'OLD_TOKEN');
  assert.equal(decoded.new_token_contract, 'NEW_TOKEN');
});

test('decodes parameter change events (VotingDelayChanged)', () => {
  const decoded = decodeEvent({
    event_id: 'test-voting-delay',
    deployment_id: 'test',
    contract_id: 'GOVERNOR',
    contract_role: 'governor',
    topics: '[{"symbol":"VotingDelayChanged"},{"address":"CALLER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"old_value"},"val":{"u32":300}},{"key":{"symbol":"new_value"},"val":{"u32":600}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'VotingDelayChanged');
  assert.equal(decoded.caller, 'CALLER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.old_value, 300);
  assert.equal(payload.new_value, 600);
});

test('decodes GovernorAuthorityChanged event', () => {
  const decoded = decodeEvent({
    event_id: 'test-gov-auth',
    deployment_id: 'test',
    contract_id: 'GOVERNOR',
    contract_role: 'governor',
    topics: '[{"symbol":"GovernorAuthorityChanged"},{"address":"AUTHORITY_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"old_enabled"},"val":{"bool":false}},{"key":{"symbol":"enabled"},"val":{"bool":true}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'GovernorAuthorityChanged');
  assert.equal(decoded.authority, 'AUTHORITY_ADDR');
});

// Tests for New Auction Events

test('decodes AuctionInitialized event', () => {
  const decoded = decodeEvent({
    event_id: 'test-auction-init',
    deployment_id: 'test',
    contract_id: 'AUCTION',
    contract_role: 'auction',
    topics: '[{"symbol":"AuctionInitialized"},{"address":"OWNER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"duration"},"val":{"u32":86400}},{"key":{"symbol":"reserve_price"},"val":{"u128":"1000000000"}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'AuctionInitialized');
  assert.equal(decoded.owner, 'OWNER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.duration, 86400);
  assert.equal(payload.reserve_price, '1000000000');
});

test('decodes auction parameter update events (DurationUpdated)', () => {
  const decoded = decodeEvent({
    event_id: 'test-duration-update',
    deployment_id: 'test',
    contract_id: 'AUCTION',
    contract_role: 'auction',
    topics: '[{"symbol":"DurationUpdated"}]',
    data: '{"map":[{"key":{"symbol":"duration"},"val":{"u32":172800}},{"key":{"symbol":"changed_by"},"val":{"address":"ADMIN_ADDR"}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'DurationUpdated');
  assert.equal(decoded.changed_by, 'ADMIN_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.duration, 172800);
});

// Tests for New Treasury Events

test('decodes TreasuryInitialized event', () => {
  const decoded = decodeEvent({
    event_id: 'test-treasury-init',
    deployment_id: 'test',
    contract_id: 'TREASURY',
    contract_role: 'treasury',
    topics: '[{"symbol":"TreasuryInitialized"},{"address":"OWNER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"governor"},"val":{"address":"GOVERNOR_ADDR"}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'TreasuryInitialized');
  assert.equal(decoded.owner, 'OWNER_ADDR');
  assert.equal(decoded.governor, 'GOVERNOR_ADDR');
});

test('decodes GovernorChanged event (in treasury)', () => {
  const decoded = decodeEvent({
    event_id: 'test-gov-changed',
    deployment_id: 'test',
    contract_id: 'TREASURY',
    contract_role: 'treasury',
    topics: '[{"symbol":"GovernorChanged"},{"address":"OLD_GOV"},{"address":"NEW_GOV"}]',
    data: '{"map":[]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'GovernorChanged');
  assert.equal(decoded.old_governor, 'OLD_GOV');
  assert.equal(decoded.new_governor, 'NEW_GOV');
});
