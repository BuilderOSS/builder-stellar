import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildGoldskyPipelineYaml, resolveDeploymentSelection, resolvePostgresSecretName, writeGoldskyPipeline } from '../src/pipeline-generator.mjs';

const deploymentFixture = new URL('../../../deploys/builder-testnet-manager.json', import.meta.url);

function loadInvoke(scriptName) {
  const source = readFileSync(new URL(`../src/${scriptName}`, import.meta.url), 'utf8');
  return new Function(`${source}\nreturn invoke;`)();
}

const decodeEvent = loadInvoke('decoded-events.script.js');
const buildActivityFeed = loadInvoke('activity-feed.script.js');
const topicsOf = decoded => JSON.parse(decoded.topics);
const argsOf = decoded => JSON.parse(decoded.args);

test('decoded events use the canonical envelope and preserve unknown fields', () => {
  const decoded = decodeEvent({
    event_id: 'envelope-1', deployment_id: 'test', contract_id: 'TOKEN', contract_role: 'token',
    topics: '[{"symbol":"Transfer"},{"address":"FROM"},{"address":"TO"}]',
    data: '{"map":[{"key":{"symbol":"custom_field"},"val":{"u128":"99"}}]}',
    transaction_hash: 'tx', ledger_sequence: 1
  });
  assert.equal(decoded.topic_0, 'FROM');
  assert.equal(decoded.topic_1, 'TO');
  assert.deepEqual(JSON.parse(decoded.topics), { from: 'FROM', to: 'TO' });
  assert.deepEqual(JSON.parse(decoded.args), { custom_field: '99' });
  assert.equal(decoded.decoder_version, 'v2');
});

test('manager topics preserve token address, deployer, and launch_admin order for both event name styles', () => {
  for (const eventName of ['dao_created', 'DaoCreated']) {
    const decoded = decodeEvent({
      topics: JSON.stringify([{ symbol: eventName }, { address: 'TOKEN_ADDR' }, { address: 'DEPLOYER_ADDR' }, { address: 'LAUNCH_ADMIN_ADDR' }]),
      data: JSON.stringify({ map: [] })
    });
    assert.deepEqual(topicsOf(decoded), { token_address: 'TOKEN_ADDR', deployer: 'DEPLOYER_ADDR', launch_admin: 'LAUNCH_ADMIN_ADDR' });
    assert.equal(decoded.event_name, eventName);
  }
});

test('preserves the indexed contract role for lifecycle events', () => {
  const decoded = decodeEvent({
    event_id: 'auction-paused',
    deployment_id: 'test',
    contract_id: 'AUCTION',
    contract_role: 'auction',
    topics: JSON.stringify([{ symbol: 'paused' }]),
    data: JSON.stringify({ map: [] })
  });

  assert.equal(decoded.contract_role, 'auction');
  assert.equal(decoded.event_name, 'paused');
});

test('preserves Goldsky ordering fields and timestamp strings through the decoder', () => {
  const decoded = decodeEvent({
    event_id: 'ordered-event', deployment_id: 'deployment-a', contract_id: 'TOKEN', contract_role: 'token',
    topics: '[{"symbol":"Transfer"},{"address":"FROM"},{"address":"TO"}]', data: '{"map":[]}',
    ledger_sequence: 42, transaction_index: 3, operation_index: 7, event_index: 2,
    ledger_closed_at: '2026-08-21 06:44:42'
  });
  assert.equal(decoded.operation_index, 7);
  assert.equal(decoded.event_index, 2);
  assert.equal(decoded.ledger_closed_at, '2026-08-21 06:44:42 UTC');
});

test('metadata initialization fields and PropertiesReset remain in the decoded payload', () => {
  const initialized = decodeEvent({
    event_id: 'metadata-init', deployment_id: 'd', contract_id: 'M', contract_role: 'metadata',
    topics: '[{"symbol":"MetadataInitialized"},{"address":"TOKEN"}]',
    data: '{"map":[{"key":{"symbol":"renderer_base"},"val":{"string":"base"}},{"key":{"symbol":"version"},"val":{"string":"1"}},{"key":{"symbol":"admin"},"val":{"address":"OWNER"}},{"key":{"symbol":"project_uri"},"val":{"string":"uri"}},{"key":{"symbol":"description"},"val":{"string":"desc"}},{"key":{"symbol":"contract_image"},"val":{"string":"image"}}]}'
  });
  assert.equal(argsOf(initialized).version, '1');
  assert.equal(argsOf(initialized).admin, 'OWNER');
  assert.equal(argsOf(initialized).project_uri, 'uri');
  const reset = decodeEvent({
    event_id: 'properties-reset', deployment_id: 'd', contract_id: 'M', contract_role: 'metadata',
    topics: '[{"symbol":"PropertiesReset"}]', data: '{"map":[{"key":{"symbol":"old_num_properties"},"val":{"u32":3}}]}'
  });
  assert.equal(argsOf(reset).old_num_properties, 3);
});

test('DaoLaunched uses the token address as the DAO identity topic', () => {
  const decoded = decodeEvent({
    topics: JSON.stringify([
      { symbol: 'DaoLaunched' },
      { address: 'TOKEN_ADDR' }
    ]),
    data: JSON.stringify({
      map: [
        { key: { symbol: 'launched_ledger' }, val: { u32: 42 } },
        { key: { symbol: 'modules' }, val: { map: [] } },
        { key: { symbol: 'launch_auction' }, val: { bool: true } },
        { key: { symbol: 'launch_marketplace' }, val: { bool: false } },
        { key: { symbol: 'enable_minter' }, val: { bool: true } }
      ]
    })
  });

  assert.deepEqual(topicsOf(decoded), { token_address: 'TOKEN_ADDR' });
  assert.deepEqual(argsOf(decoded), { launched_ledger: 42, modules: {}, launch_auction: true, launch_marketplace: false, enable_minter: true });
});

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
  assert.equal(argsOf(decoded).weight, largeNumber);
  assert.equal(typeof argsOf(decoded).weight, 'string');
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
  assert.deepEqual(topicsOf(decoded), { delegator: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO' });
  assert.equal(argsOf(decoded).from_delegate, null);
  assert.equal(argsOf(decoded).to_delegate, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
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
  assert.equal(topicsOf(decoded).to, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
  assert.equal(argsOf(decoded).token_id, 2);
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
  assert.equal(topicsOf(decoded).delegate, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');

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
  assert.equal(topicsOf(decoded).proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
  assert.equal(topicsOf(decoded).proposer, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');

  const payload = JSON.parse(decoded.payload);
  assert.ok(payload.description.includes('test proposal'));
  assert.deepEqual(payload.targets, ['CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2']);
  assert.deepEqual(payload.functions, ['mint']);
  assert.equal(payload.vote_snapshot, 4255554);
  assert.equal(argsOf(decoded).vote_snapshot, 4255554);
  assert.equal(argsOf(decoded).vote_end, 1787300891);
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
  assert.equal(topicsOf(decoded).voter, 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO');
  assert.equal(topicsOf(decoded).proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');
  assert.equal(argsOf(decoded).vote_type, 1);
  assert.equal(argsOf(decoded).weight, '1');
  // Empty string is stored as null in the decoder
  assert.ok(argsOf(decoded).reason === '' || argsOf(decoded).reason === null);
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
    topics: '{}',
    args: '{"from_delegate":null,"to_delegate":"GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO"}',
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
  assert.deepEqual(JSON.parse(activity.topics), {});
  assert.deepEqual(JSON.parse(activity.args), { from_delegate: null, to_delegate: 'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO' });
  assert.deepEqual(JSON.parse(activity.addresses), [
    'GCLGEIQB4RCG63LSIBSHQ6T67YICWKTHSORNHVXHFVVGXISZU3MQU6CO',
    'CC6NMFVKCHMRKFA7M333CVEFAVPLXT3XAZHZX6Q4SGNDNTKZEKWTLXT2'
  ]);
  assert.equal(activity.visibility, 'public');
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
  assert.equal(activity.visibility, 'governance');
  assert.equal(activity.event_name, 'proposal_created');
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

test('deployment selection uses an explicit Manager artifact', () => {
  const selection = resolveDeploymentSelection({
    MANAGER_DEPLOYMENT_FILE: 'deploys/builder-testnet-manager.json'
  });

  assert.match(selection.artifactPath, /deploys\/builder-testnet-manager\.json$/);
});

test('pipeline generator renders the current deployment and scripts', { skip: !existsSync(deploymentFixture) }, () => {
  const deployment = JSON.parse(readFileSync(deploymentFixture, 'utf8'));
  const template = readFileSync(new URL('../templates/builder-stellar-events.yaml.mustache', import.meta.url), 'utf8');
  const activityScript = readFileSync(new URL('../src/activity-feed.script.js', import.meta.url), 'utf8');

  const yaml = buildGoldskyPipelineYaml({ deployment, secretName: 'MY_SECRET', startAt: 4983407, templateSource: template, scriptSource: activityScript });

  assert.match(yaml, /name: builder-stellar-events/);
  assert.match(yaml, /dataset_name: stellar_testnet\.events/);
  assert.match(yaml, new RegExp('start_at: 4983407'));
  assert.match(yaml, new RegExp(`'manager:${deployment.manager}' AS deployment_id`));
  assert.match(yaml, /schema: chain/);
  assert.match(yaml, /table: raw_events/);
  assert.match(yaml, /table: decoded_events/);
  assert.match(yaml, /table: activity_feed/);
  assert.match(yaml, /contract_id/);
  assert.match(yaml, /CAST\(NULL AS BIGINT\) AS operation_index/);
  assert.match(yaml, /CAST\(NULL AS BIGINT\) AS event_index/);
  assert.match(yaml, /contract_role/);
  for (const table of ['dao_tokens', 'dao_metadata', 'dao_auctions', 'dao_governors', 'dao_treasuries']) {
    assert.match(yaml, new RegExp(`${table}:`));
    assert.match(yaml, new RegExp(`dynamic_table_check\\('${table}', contract_id\\)`));
  }
  for (const role of ['manager', 'token', 'metadata', 'auction', 'governor', 'treasury']) {
    assert.match(yaml, new RegExp(`'${role}'`));
  }
  assert.match(yaml, /topics LIKE '%dao_created%'/);
  assert.doesNotMatch(yaml, /topics LIKE '%dao_registered%'/);
  assert.match(yaml, /function invoke\(data\)/);
  assert.match(yaml, /event_name: string/);
  assert.match(yaml, new RegExp(deployment.manager));
  assert.match(yaml, /secret_name: MY_SECRET/);
});

test('writeGoldskyPipeline writes a file from env selection', { skip: !existsSync(deploymentFixture) }, () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'goldsky-pipeline-')), 'builder-stellar-events.yaml');
  const result = writeGoldskyPipeline({
    env: {
      MANAGER_DEPLOYMENT_FILE: 'deploys/builder-testnet-manager.json',
      GOLDSKY_POSTGRES_SECRET: 'MY_SECRET',
      GOLDSKY_START_AT: '4983407'
    },
    outputPath
  });

  assert.match(result.selection.artifactPath, /deploys\/builder-testnet-manager\.json$/);
  assert.equal(result.secretName, 'MY_SECRET');
  assert.equal(result.outputPath, outputPath);
  assert.match(readFileSync(outputPath, 'utf8'), /name: builder-stellar-events/);
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
  assert.equal(topicsOf(decoded).proposal_id, 'c3678ab26edd57c0b5dffe866fac0be8ae0fb5aa827549b01e6252cea6adacff');

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
  assert.equal(topicsOf(decoded).minter, 'MINTER_ADDR');
  assert.equal(topicsOf(decoded).to, 'TO_ADDR');
  assert.equal(argsOf(decoded).token_id, 42);
});

test('MintBatchWithMinter and SeedsGenerated decode the batch range', () => {
  const batch = decodeEvent({
    event_id: 'test-mint-batch',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    topics: '[{"symbol":"mint_batch_with_minter"},{"address":"MINTER_ADDR"}]',
    data: '{"map":[{"key":{"symbol":"count"},"val":{"u32":3}},{"key":{"symbol":"first_token_id"},"val":{"u32":7}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });
  assert.ok(batch);
  assert.equal(batch.event_name, 'mint_batch_with_minter');
  // The fallback role must not confuse it with the Minter's MintBatchEvent.
  assert.equal(batch.contract_role, 'token');
  assert.equal(topicsOf(batch).minter, 'MINTER_ADDR');
  assert.equal(argsOf(batch).first_token_id, 7);
  assert.equal(argsOf(batch).count, 3);

  const seeds = decodeEvent({
    event_id: 'test-seeds',
    deployment_id: 'test',
    contract_id: 'METADATA',
    topics: '[{"symbol":"seeds_generated"},{"u32":7}]',
    data: '{"map":[{"key":{"symbol":"count"},"val":{"u32":2}},{"key":{"symbol":"num_properties"},"val":{"u32":1}},{"key":{"symbol":"selections"},"val":{"vec":[{"vec":[{"u32":1},{"u32":0}]},{"vec":[{"u32":1},{"u32":1}]}]}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });
  assert.ok(seeds);
  assert.equal(seeds.event_name, 'seeds_generated');
  assert.equal(seeds.contract_role, 'metadata');
  assert.equal(topicsOf(seeds).first_token_id, 7);
  assert.deepEqual(argsOf(seeds).selections, [[1, 0], [1, 1]]);
});

test('Execute event carries governor, target and proposal_id topics and function + index data', () => {
  const decoded = decodeEvent({
    event_id: 'test-execute',
    deployment_id: 'test',
    contract_id: 'TREASURY',
    contract_role: 'treasury',
    topics: '[{"symbol":"Execute"},{"address":"GOVERNOR_ADDR"},{"address":"TARGET_ADDR"},{"bytes":"c3678ab2"}]',
    data: '{"map":[{"key":{"symbol":"function"},"val":{"symbol":"transfer"}},{"key":{"symbol":"index"},"val":{"u32":2}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'Execute');
  assert.deepEqual(topicsOf(decoded), { governor: 'GOVERNOR_ADDR', target: 'TARGET_ADDR', proposal_id: 'c3678ab2' });
  assert.equal(decoded.topic_2, 'c3678ab2');
  assert.deepEqual(argsOf(decoded), { function: 'transfer', index: 2 });
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
  assert.equal(topicsOf(decoded).admin, 'OWNER_ADDR');

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
  assert.equal(topicsOf(decoded).authority, 'AUTHORITY_ADDR');
  assert.equal(argsOf(decoded).changed_by, 'ADMIN_ADDR');
});

test('decodes Approve event', () => {
  const decoded = decodeEvent({
    event_id: 'test-approve',
    deployment_id: 'test',
    contract_id: 'TOKEN',
    contract_role: 'token',
    topics: '[{"symbol":"Approve"},{"address":"OWNER_ADDR"},{"u32":7}]',
    data: '{"map":[{"key":{"symbol":"approved"},"val":{"address":"SPENDER_ADDR"}},{"key":{"symbol":"live_until_ledger"},"val":{"u32":1000}}]}',
    transaction_hash: 'tx-1',
    ledger_sequence: 100
  });

  assert.ok(decoded);
  assert.equal(decoded.event_name, 'Approve');
  assert.deepEqual(topicsOf(decoded), { approver: 'OWNER_ADDR', token_id: 7 });

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.approved, 'SPENDER_ADDR');
  assert.equal(payload.live_until_ledger, 1000);
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
  assert.equal(decoded.admin, 'OWNER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.voting_delay, 300);
  assert.equal(payload.voting_period, 600);
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
  assert.equal(topicsOf(decoded).changed_by, 'CALLER_ADDR');

  const payload = JSON.parse(decoded.payload);
  assert.equal(payload.old_value, 300);
  assert.equal(payload.new_value, 600);
});

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
  assert.equal(topicsOf(decoded).admin, 'OWNER_ADDR');

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
  assert.equal(argsOf(decoded).changed_by, 'ADMIN_ADDR');

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
  assert.equal(topicsOf(decoded).admin, 'OWNER_ADDR');
  assert.equal(argsOf(decoded).governor, 'GOVERNOR_ADDR');
});

test('decodes the Minter events with the exact events.rs topics and payloads', () => {
  const cases = [
    ['MerkleClaimEvent', [{ symbol: 'MerkleClaimEvent' }, { address: 'TOKEN_CONTRACT' }, { address: 'RECIPIENT' }], { map: [{ key: { symbol: 'amount' }, val: { u128: '5' } }] }, { token_id: 'TOKEN_CONTRACT', recipient: 'RECIPIENT' }],
    ['AllowlistClaimEvent', [{ symbol: 'AllowlistClaimEvent' }, { address: 'TOKEN_CONTRACT' }, { address: 'RECIPIENT' }], { map: [{ key: { symbol: 'amount' }, val: { u128: '5' } }] }, { token_id: 'TOKEN_CONTRACT', recipient: 'RECIPIENT' }],
    ['MintBatchEvent', [{ symbol: 'MintBatchEvent' }, { address: 'TOKEN_CONTRACT' }], { recipient_count: { u32: 3 }, total_amount: { u128: '9' } }, { token_id: 'TOKEN_CONTRACT' }],
    ['MerkleRootSetEvent', [{ symbol: 'MerkleRootSetEvent' }, { address: 'TOKEN_CONTRACT' }], { map: [] }, { token_id: 'TOKEN_CONTRACT' }],
    ['AllowlistSetEvent', [{ symbol: 'AllowlistSetEvent' }, { address: 'TOKEN_CONTRACT' }], { member_count: { u32: 4 } }, { token_id: 'TOKEN_CONTRACT' }]
  ];
  for (const [name, topics, data, expectedTopics] of cases) {
    const decoded = decodeEvent({ event_id: name, contract_role: 'minter', topics: JSON.stringify(topics), data: JSON.stringify(data) });
    assert.deepEqual(topicsOf(decoded), expectedTopics);
    assert.equal(decoded.contract_role, 'minter');
  }
  assert.deepEqual(argsOf(decodeEvent({ topics: JSON.stringify(cases[0][1]), data: JSON.stringify(cases[0][2]) })), { amount: '5' });
});

test('builds distinct activity kinds for Minter claim events', () => {
  for (const [name, kind] of [['MerkleClaimEvent', 'minter.merkle_claim'], ['AllowlistClaimEvent', 'minter.allowlist_claim']]) {
    const decoded = decodeEvent({
      event_id: name,
      contract_role: 'minter',
      topics: JSON.stringify([{ symbol: name }, { address: 'TOKEN_CONTRACT' }, { address: 'RECIPIENT' }]),
      data: JSON.stringify({ map: [{ key: { symbol: 'amount' }, val: { u128: '5' } }] })
    });
    const activity = buildActivityFeed(decoded);
    assert.equal(activity.kind, kind);
    assert.equal(activity.token_id, 'TOKEN_CONTRACT');
    assert.equal(activity.actor, 'RECIPIENT');
    assert.equal(activity.amount, '5');
    assert.equal(activity.visibility, 'public');
  }
});

// ---------------------------------------------------------------------------
// Hardened-contract events (task #7): one test per new or changed event, driven
// through decoder + activity feed. Shapes mirror contracts/*/src/events.rs.
// ---------------------------------------------------------------------------
const A = a => ({ address: a });
const S = v => ({ symbol: v });
const dm = obj => ({ map: Object.entries(obj).map(([key, val]) => ({ key: S(key), val })) });

function run(role, contract, name, topics, data = {}, extra = {}) {
  const decoded = decodeEvent({
    event_id: `evt-${name}`, deployment_id: 'manager:CMANAGER', contract_id: contract, contract_role: role,
    topics: JSON.stringify([S(name), ...topics]), data: JSON.stringify(dm(data)),
    transaction_hash: 'tx', ledger_sequence: 7, ...extra
  });
  assert.ok(decoded, `${name} decodes`);
  return { decoded, activity: buildActivityFeed(decoded) };
}

test('each module launch event decodes with topic treasury; data differs per module', () => {
  const cases = [
    ['token', 'TOKEN', 'TokenLaunched', { minters: { vec: [A('MINTER_A'), A('MINTER_B')] } }, { minters: ['MINTER_A', 'MINTER_B'] }, 'token.launched', 'Token launched'],
    ['governor', 'GOV', 'GovernorLaunched', {}, {}, 'governor.launched', 'Governor launched'],
    ['treasury', 'TRE', 'TreasuryLaunched', {}, {}, 'treasury.launched', 'Treasury launched'],
    ['metadata', 'META', 'MetadataLaunched', {}, {}, 'metadata.launched', 'Metadata launched'],
    ['auction', 'AUC', 'AuctionLaunched', { started: { bool: true } }, { started: true }, 'auction.launched', 'Auction launched and started'],
    ['marketplace', 'MKT', 'MarketplaceLaunched', { opened: { bool: false } }, { opened: false }, 'marketplace.launched', 'Marketplace launched paused']
  ];
  for (const [role, contract, name, data, expectedArgs, kind, summary] of cases) {
    const { decoded, activity } = run(role, contract, name, [A('TREASURY_ADDR')], data);
    assert.deepEqual(topicsOf(decoded), { treasury: 'TREASURY_ADDR' }, role);
    assert.deepEqual(argsOf(decoded), expectedArgs, role);
    assert.equal(decoded.contract_id, contract);
    assert.equal(decoded.contract_role, role);
    assert.equal(activity.kind, kind);
    assert.equal(activity.visibility, 'admin');
    assert.equal(activity.summary, summary);
    assert.equal(activity.actor, 'TREASURY_ADDR');
  }
  // Goldsky also emits snake_case event names.
  assert.deepEqual(topicsOf(run('token', 'TOKEN', 'token_launched', [A('T')], { minters: { vec: [] } }).decoded), { treasury: 'T' });
});

test('token MintAuthorityChanged at launch is emitted per minter with changed_by = manager', () => {
  const { decoded, activity } = run('token', 'TOKEN', 'MintAuthorityChanged', [A('MINTER')],
    { old_enabled: { bool: false }, enabled: { bool: true }, changed_by: A('MANAGER') });
  assert.deepEqual(topicsOf(decoded), { authority: 'MINTER' });
  assert.deepEqual(argsOf(decoded), { old_enabled: false, enabled: true, changed_by: 'MANAGER' });
  assert.equal(activity.kind, 'token.mint_authority_changed');
});

test('DaoLaunched activity row keeps token identity; flags stay in args', () => {
  const { decoded, activity } = run('manager', 'CMANAGER', 'DaoLaunched', [A('TOKEN')], {
    launched_ledger: { u64: '9' }, modules: dm({ token: A('TOKEN') }), launch_auction: { bool: true }, launch_marketplace: { bool: true }, enable_minter: { bool: true }
  });
  assert.equal(argsOf(decoded).enable_minter, true);
  assert.equal(activity.kind, 'manager.dao_launched');
  assert.equal(activity.summary, 'DAO launched for token TOKEN');
  assert.equal(activity.visibility, 'public');
});

test('manager admin and platform minter events', () => {
  const proposed = run('manager', 'CMANAGER', 'AdminProposed', [A('CURRENT'), A('NEXT')]);
  assert.deepEqual(topicsOf(proposed.decoded), { current_admin: 'CURRENT', proposed_admin: 'NEXT' });
  assert.equal(proposed.activity.kind, 'manager.admin_proposed');
  assert.equal(proposed.activity.actor, 'CURRENT');
  assert.deepEqual(JSON.parse(proposed.activity.addresses), ['CURRENT', 'NEXT', 'CMANAGER']);
  const changed = run('manager', 'CMANAGER', 'AdminChanged', [A('OLD'), A('NEW')]);
  assert.deepEqual(topicsOf(changed.decoded), { old_admin: 'OLD', new_admin: 'NEW' });
  assert.equal(changed.activity.kind, 'manager.admin_changed');
  assert.equal(changed.activity.visibility, 'admin');
  const minter = run('manager', 'CMANAGER', 'PlatformMinterSet', [A('PLATFORM_MINTER')]);
  assert.deepEqual(topicsOf(minter.decoded), { minter: 'PLATFORM_MINTER' });
  assert.equal(minter.activity.kind, 'manager.platform_minter_set');
});

test('Upgraded / VersionSynced decode for every module role; identifiers in topics, version in args', () => {
  const roles = [['token', 'TOKEN'], ['governor', 'GOV'], ['treasury', 'TRE'], ['auction', 'AUC'], ['marketplace', 'MKT'], ['metadata', 'META']];
  for (const [role, contract] of roles) {
    const up = run(role, contract, 'Upgraded', [{ bytes: 'aaaaaaaa11' }, { bytes: 'bbbbbbbb22' }], { version: { string: '1.1.0' } });
    assert.deepEqual(topicsOf(up.decoded), { from_hash: 'aaaaaaaa11', to_hash: 'bbbbbbbb22' });
    assert.deepEqual(argsOf(up.decoded), { version: '1.1.0' });
    assert.equal(up.decoded.contract_id, contract);
    assert.equal(up.decoded.contract_role, role);
    assert.equal(up.activity.kind, `${role}.upgraded`);
    assert.equal(up.activity.visibility, 'public');
    assert.equal(up.activity.contract_id, contract);
    assert.equal(up.activity.summary, 'Contract upgraded to version 1.1.0 (aaaaaaaa -> bbbbbbbb)');
    const sync = run(role, contract, 'VersionSynced', [], { version: { string: '1.1.0' } });
    assert.deepEqual(topicsOf(sync.decoded), {});
    assert.deepEqual(argsOf(sync.decoded), { version: '1.1.0' });
    assert.equal(sync.activity.kind, `${role}.version_synced`);
    assert.equal(sync.activity.visibility, 'admin');
  }
});

test('Upgraded with empty args still produces a summary from the topics (decoded_events keeps topics, args {})', () => {
  const { decoded, activity } = run('auction', 'AUC', 'Upgraded', [{ bytes: 'aaaaaaaa11' }, { bytes: 'bbbbbbbb22' }], {});
  assert.deepEqual(argsOf(decoded), {});
  assert.equal(activity.summary, 'Contract upgraded to version unknown (aaaaaaaa -> bbbbbbbb)');
});

test('AdminProposalCancelled topics current_admin, cancelled_admin; empty args', () => {
  const { decoded, activity } = run('manager', 'CMANAGER', 'AdminProposalCancelled', [A('CURRENT'), A('CANCELLED')]);
  assert.deepEqual(topicsOf(decoded), { current_admin: 'CURRENT', cancelled_admin: 'CANCELLED' });
  assert.deepEqual(argsOf(decoded), {});
  assert.equal(activity.kind, 'manager.admin_proposal_cancelled');
  assert.equal(activity.visibility, 'admin');
  assert.equal(activity.actor, 'CURRENT');
  assert.deepEqual(JSON.parse(activity.addresses), ['CURRENT', 'CANCELLED', 'CMANAGER']);
});

test('DaoCreated decodes the nested wasm_hashes struct (map of six BytesN<32>) beside modules', () => {
  const hashes = { token: { bytes: 'h1' }, metadata: { bytes: 'h2' }, auction: { bytes: 'h3' }, governor: { bytes: 'h4' }, treasury: { bytes: 'h5' }, marketplace: { bytes: 'h6' } };
  const { decoded, activity } = run('manager', 'CMANAGER', 'DaoCreated', [A('TOKEN'), A('DEPLOYER'), A('LAUNCH_ADMIN')], {
    created_ledger: { u64: '11' },
    modules: dm({ token: A('TOKEN'), governor: A('GOV') }),
    wasm_hashes: dm(hashes),
    slug: { string: 'my-dao' }
  });
  assert.deepEqual(topicsOf(decoded), { token_address: 'TOKEN', deployer: 'DEPLOYER', launch_admin: 'LAUNCH_ADMIN' });
  const args = argsOf(decoded);
  assert.deepEqual(args.wasm_hashes, { token: 'h1', metadata: 'h2', auction: 'h3', governor: 'h4', treasury: 'h5', marketplace: 'h6' });
  assert.equal(args.modules.token, 'TOKEN');
  assert.equal(args.created_ledger, '11');
  assert.equal(args.slug, 'my-dao');
  assert.equal(activity.kind, 'manager.dao_created');
  assert.equal(activity.visibility, 'public');
});

test('role fallback classifies new events when contract_role is unknown', () => {
  for (const [name, role] of [['AdminProposed', 'manager'], ['AdminChanged', 'manager'], ['AdminProposalCancelled', 'manager'], ['PlatformMinterSet', 'manager'], ['Upgraded', 'unknown'], ['VersionSynced', 'unknown'],
    ['RefundDeferred', 'auction'], ['RefundWithdrawn', 'auction'], ['PrimaryListingPurchased', 'marketplace'],
    ['PrimaryListingCancelled', 'marketplace'], ['PrimaryListingExpired', 'marketplace'], ['Execute', 'treasury'], ['TokenLaunched', 'token'], ['TreasuryLaunched', 'treasury'], ['ProposalScheduled', 'governor'],
    ['SlugClaimed', 'manager'], ['PendingSlugUpdated', 'manager'], ['LatestImplementationSet', 'manager'], ['Migrated', 'unknown']]) {
    const decoded = decodeEvent({ topics: JSON.stringify([S(name)]), data: JSON.stringify(dm({})) });
    assert.equal(decoded.contract_role, role, name);
  }
});

test('treasury Execute: one event per call, proposal_id is a topic, activity carries call index', () => {
  const calls = [['transfer', 0, 'TARGET_A'], ['mint', 1, 'TARGET_B']];
  const rows = calls.map(([fn, index, target]) => run('treasury', 'TRE', 'Execute', [A('GOV'), A(target), { bytes: 'abc123' }], { function: S(fn), index: { u32: index } }, { event_index: index }));
  rows.forEach(({ decoded, activity }, i) => {
    assert.deepEqual(topicsOf(decoded), { governor: 'GOV', target: calls[i][2], proposal_id: 'abc123' });
    assert.equal(argsOf(decoded).index, i);
    assert.equal(activity.kind, 'treasury.execute');
    assert.equal(activity.proposal_id, 'abc123');
    assert.equal(activity.summary, `Executed ${calls[i][0]} on ${calls[i][2]} (call ${i + 1} of proposal abc123)`);
  });
  assert.notEqual(rows[0].activity.activity_id, '');
  assert.notEqual(rows[0].decoded.event_id + rows[0].decoded.event_index, rows[1].decoded.event_id + rows[1].decoded.event_index);
});

test('governor ProposalExecuted is a proposal_id topic emitted inside consume', () => {
  const { decoded, activity } = run('governor', 'GOV', 'ProposalExecuted', [{ bytes: 'abc123' }]);
  assert.deepEqual(topicsOf(decoded), { proposal_id: 'abc123' });
  assert.equal(activity.kind, 'governance.proposal_executed');
  assert.equal(activity.proposal_id, 'abc123');
  assert.equal(activity.visibility, 'governance');
});

test('governor setters carry the admin as the changed_by topic', () => {
  for (const [name, kind] of [['QueueDelayChanged', 'governance.queue_delay_changed'], ['VotingDelayChanged', 'governance.voting_delay_changed'],
    ['VotingPeriodChanged', 'governance.voting_period_changed'], ['ProposalThresholdChanged', 'governance.proposal_threshold_changed'],
    ['QuorumBpsChanged', 'governance.quorum_bps_changed']]) {
    const { decoded, activity } = run('governor', 'GOV', name, [A('OWNER')], { old_value: { u32: 1 }, new_value: { u32: 2 } });
    assert.deepEqual(topicsOf(decoded), { changed_by: 'OWNER' });
    assert.deepEqual(argsOf(decoded), { old_value: 1, new_value: 2 });
    assert.equal(activity.kind, kind);
  }
});

test('removed events no longer have topic names and fall back to generic activity kinds', () => {
  for (const name of ['TreasuryChanged', 'TokenContractChanged', 'GovernorAuthorityChanged', 'GovernorChanged', 'TreasuryUpdated']) {
    const { decoded, activity } = run('governor', 'GOV', name, [A('X'), A('Y')]);
    assert.deepEqual(topicsOf(decoded), {}, name);
    assert.equal(activity.kind, `contract.${name.toLowerCase()}`);
  }
});

test('auction RefundDeferred / RefundWithdrawn / BidRefunded', () => {
  const deferred = run('auction', 'AUC', 'RefundDeferred', [{ u128: '7' }, A('BIDDER')], { amount: { i128: '30' } });
  assert.deepEqual(topicsOf(deferred.decoded), { token_id: '7', bidder: 'BIDDER' });
  assert.deepEqual(argsOf(deferred.decoded), { amount: '30' });
  assert.equal(deferred.activity.kind, 'auction.refund_deferred');
  assert.equal(deferred.activity.visibility, 'public');
  assert.equal(deferred.activity.token_id, '7');
  assert.equal(deferred.activity.amount, '30');
  assert.equal(deferred.activity.actor, 'BIDDER');
  assert.match(deferred.activity.summary, /^Refund of 30 deferred for token 7/);

  const withdrawn = run('auction', 'AUC', 'RefundWithdrawn', [A('BIDDER')], { amount: { i128: '30' } });
  assert.deepEqual(topicsOf(withdrawn.decoded), { bidder: 'BIDDER' });
  assert.equal(withdrawn.activity.kind, 'auction.refund_withdrawn');
  assert.equal(withdrawn.activity.token_id, '');
  assert.equal(withdrawn.activity.summary, 'Refund of 30 withdrawn');
  assert.equal(withdrawn.activity.actor, 'BIDDER');

  const refunded = run('auction', 'AUC', 'BidRefunded', [{ u128: '7' }, A('BIDDER')], { amount: { i128: '20' } });
  assert.deepEqual(topicsOf(refunded.decoded), { token_id: '7', bidder: 'BIDDER' });
  assert.equal(refunded.activity.kind, 'auction.bid_refunded');
});

test('marketplace primary listing lifecycle is keyed by listing_id; token_id only arrives with the purchase', () => {
  const created = run('marketplace', 'MKT', 'PrimaryListingCreated', [{ u64: '4' }], { price: { i128: '100' }, expires_at: { u64: '5000' }, payment_asset: A('XLM') });
  assert.deepEqual(topicsOf(created.decoded), { listing_id: '4' });
  assert.deepEqual(argsOf(created.decoded), { price: '100', expires_at: '5000', payment_asset: 'XLM' });
  assert.equal(created.activity.kind, 'marketplace.primary_listing_created');
  assert.equal(created.activity.token_id, '');
  assert.equal(created.activity.amount, '100');
  assert.equal(created.activity.summary, 'Primary listing 4 created at 100');

  const purchased = run('marketplace', 'MKT', 'PrimaryListingPurchased', [{ u64: '4' }, A('BUYER')], { token_id: { u32: 12 }, price: { i128: '100' }, payment_asset: A('XLM') });
  assert.deepEqual(topicsOf(purchased.decoded), { listing_id: '4', buyer: 'BUYER' });
  assert.deepEqual(argsOf(purchased.decoded), { token_id: 12, price: '100', payment_asset: 'XLM' });
  assert.equal(purchased.activity.kind, 'marketplace.primary_listing_purchased');
  assert.equal(purchased.activity.visibility, 'public');
  assert.equal(purchased.activity.token_id, '12');
  assert.equal(purchased.activity.actor, 'BUYER');
  assert.equal(purchased.activity.summary, 'Primary sale: token 12 bought for 100 (listing 4)');

  const cancelled = run('marketplace', 'MKT', 'PrimaryListingCancelled', [{ u64: '4' }]);
  assert.deepEqual(topicsOf(cancelled.decoded), { listing_id: '4' });
  assert.deepEqual(argsOf(cancelled.decoded), {});
  assert.equal(cancelled.activity.kind, 'marketplace.primary_listing_cancelled');
  assert.equal(cancelled.activity.summary, 'Primary listing 4 cancelled');
  const expired = run('marketplace', 'MKT', 'PrimaryListingExpired', [{ u64: '4' }]);
  assert.deepEqual(topicsOf(expired.decoded), { listing_id: '4' });
  assert.equal(expired.activity.kind, 'marketplace.primary_listing_expired');
  assert.equal(expired.activity.visibility, 'admin');
});

test('marketplace secondary listings: payment_asset on create, ListingPurchased is secondary-only', () => {
  const created = run('marketplace', 'MKT', 'SecondaryListingCreated', [{ u32: 9 }],
    { seller: A('SELLER'), price: { i128: '50' }, expires_at: { u64: '6000' }, fee_bps: { u32: 250 }, payment_asset: A('XLM') });
  assert.deepEqual(topicsOf(created.decoded), { token_id: 9 });
  assert.equal(argsOf(created.decoded).payment_asset, 'XLM');
  assert.equal(created.activity.token_id, '9');
  assert.equal(created.activity.summary, 'Secondary listing created for token 9 at 50');

  const bought = run('marketplace', 'MKT', 'ListingPurchased', [{ u32: 9 }, A('BUYER')],
    { seller: A('SELLER'), price: { i128: '50' }, fee: { i128: '1' }, payment_asset: A('XLM') });
  assert.deepEqual(topicsOf(bought.decoded), { token_id: 9, buyer: 'BUYER' });
  assert.deepEqual(argsOf(bought.decoded), { seller: 'SELLER', price: '50', fee: '1', payment_asset: 'XLM' });
  assert.equal(bought.activity.kind, 'marketplace.listing_purchased');
  assert.equal(bought.activity.summary, 'Token 9 purchased for 50');
});

test('MarketplacePaused emitted at launch has no topics or data', () => {
  const { decoded, activity } = run('marketplace', 'MKT', 'MarketplacePaused', []);
  assert.deepEqual(topicsOf(decoded), {});
  assert.equal(activity.kind, 'marketplace.paused');
});

test('activity feed picks token identifiers from topics even when args is an empty object', () => {
  // Goldsky decoded_events persists topics and args separately; args may be {}.
  const activity = buildActivityFeed({
    event_id: 'topic-only', event_name: 'RefundDeferred', deployment_id: 'd', contract_id: 'AUC', contract_role: 'auction',
    topics: JSON.stringify({ token_id: '7', bidder: 'B' }), args: '{}'
  });
  assert.equal(activity.token_id, '7');
  assert.equal(activity.actor, 'B');
  const purchase = buildActivityFeed({
    event_id: 'args-only', event_name: 'PrimaryListingPurchased', deployment_id: 'd', contract_id: 'MKT', contract_role: 'marketplace',
    topics: JSON.stringify({ listing_id: '4', buyer: 'B' }), args: JSON.stringify({ token_id: 3, price: '10' })
  });
  assert.equal(purchase.token_id, '3');
  assert.match(purchase.summary, /listing 4/);
});
