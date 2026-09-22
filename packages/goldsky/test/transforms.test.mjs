import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read and execute all three transform scripts
const rawEventsScript = readFileSync(join(__dirname, '../src/raw-events.script.js'), 'utf-8');
const decodedEventsScript = readFileSync(join(__dirname, '../src/decoded-events.script.js'), 'utf-8');
const activityFeedScript = readFileSync(join(__dirname, '../src/activity-feed.script.js'), 'utf-8');

const invokeRawEvents = eval(`(${rawEventsScript})`);
const invokeDecodedEvents = eval(`(${decodedEventsScript})`);
const invokeActivityFeed = eval(`(${activityFeedScript})`);

// Test helpers
function testTypeConsistency(obj, fieldName, expectedType) {
  const value = obj[fieldName];
  const actualType = typeof value;
  assert.strictEqual(
    actualType,
    expectedType,
    `Field "${fieldName}" should be ${expectedType} but is ${actualType}. Value: ${JSON.stringify(value)}`
  );
}

function testAllFieldsPresent(obj, requiredFields) {
  for (const field of requiredFields) {
    assert.ok(
      field in obj,
      `Required field "${field}" is missing from result object`
    );
  }
}

console.log('🧪 Running transform type consistency tests...\n');

// ==================== RAW EVENTS TESTS ====================
console.log('═══════════════════════════════════════');
console.log('🔍 RAW-EVENTS TRANSFORM TESTS');
console.log('═══════════════════════════════════════\n');

const rawEventsFields = [
  'event_id', 'deployment_id', 'contract_id', 'contract_role',
  'topics', 'data', 'transaction_hash', 'transaction_successful',
  'ledger_sequence', 'ledger_hash', 'ledger_closed_at',
  'transaction_index', 'operation_index', 'event_index',
  'operation_type', '_gs_op'
];

// Test 1: Raw events - null handling
console.log('Test 1: Raw events - null/undefined input handling');
assert.strictEqual(invokeRawEvents(null), null);
assert.strictEqual(invokeRawEvents(undefined), null);
console.log('✅ Passed\n');

// Test 2: Raw events - type consistency
console.log('Test 2: Raw events - consistent types across multiple rows');
const rawRows = [
  { event_id: '1', deployment_id: 'test', contract_id: 'test', contract_role: 'token', topics: null, data: null, transaction_hash: 'hash1', ledger_sequence: 100, transaction_index: 0, operation_index: 0, event_index: 0, transaction_successful: true },
  { event_id: '2', deployment_id: 'test', contract_id: 'test', contract_role: 'governor', topics: '{}', data: '{}', transaction_hash: 'hash2', ledger_sequence: 101, transaction_index: 1, operation_index: 1, event_index: 1, transaction_successful: false },
  { event_id: undefined, deployment_id: undefined, contract_id: undefined, topics: undefined, data: undefined, transaction_hash: undefined, ledger_sequence: undefined, transaction_index: undefined, operation_index: undefined, event_index: undefined, transaction_successful: undefined }
];

const rawResults = rawRows.map(row => invokeRawEvents(row));
const rawTypeMap = {};

for (const result of rawResults) {
  for (const field of rawEventsFields) {
    if (result === null) continue;
    const currentType = result[field] === null ? 'null' : typeof result[field];
    if (!rawTypeMap[field]) {
      rawTypeMap[field] = currentType;
    } else if (rawTypeMap[field] !== currentType && currentType !== 'null') {
      throw new Error(`Type inconsistency for raw-events field "${field}": expected ${rawTypeMap[field]} but got ${currentType}`);
    }
  }
}
console.log('✅ Passed - All rows have consistent types\n');

// Test 3: Raw events - no NaN or Infinity
console.log('Test 3: Raw events - numeric fields are finite');
const rawNumericResult = invokeRawEvents({
  event_id: '5',
  deployment_id: 'test',
  contract_id: 'test',
  contract_role: 'token',
  topics: '{}',
  data: '{}',
  ledger_sequence: 123,
  transaction_index: 5,
  operation_index: 2,
  event_index: 0
});
assert.ok(Number.isFinite(rawNumericResult.ledger_sequence), 'ledger_sequence should be finite');
assert.ok(Number.isFinite(rawNumericResult.transaction_index), 'transaction_index should be finite');
assert.ok(Number.isFinite(rawNumericResult.operation_index), 'operation_index should be finite');
assert.ok(Number.isFinite(rawNumericResult.event_index), 'event_index should be finite');
console.log('✅ Passed\n');

// ==================== DECODED EVENTS TESTS ====================
console.log('═══════════════════════════════════════');
console.log('🔍 DECODED-EVENTS TRANSFORM TESTS');
console.log('═══════════════════════════════════════\n');

const decodedEventsFields = [
  'event_id', 'deployment_id', 'contract_id', 'contract_role', 'event_name',
  'topic_0', 'topic_1', 'topic_2', 'topic_3', 'topics', 'args', 'payload',
  'transaction_hash', 'transaction_successful', 'ledger_sequence', 'ledger_hash',
  'ledger_closed_at', 'transaction_index', 'operation_index', 'event_index',
  'operation_type', '_gs_op', 'decoder_version'
];

// Test 4: Decoded events - minimal valid input
console.log('Test 4: Decoded events - minimal valid input');
const decodedMinimalInput = {
  event_id: 'event-123',
  deployment_id: 'manager:ABC123',
  contract_id: 'CONTRACT123',
  topics: JSON.stringify([['Transfer']]),
  data: JSON.stringify({ to: 'account1', amount: '1000' })
};
const decodedMinimalResult = invokeDecodedEvents(decodedMinimalInput);
assert.ok(decodedMinimalResult, 'Should return an object for valid input');
testAllFieldsPresent(decodedMinimalResult, ['event_id', 'event_name', 'topics', 'args']);
console.log('✅ Passed\n');

// Test 5: Decoded events - type consistency
console.log('Test 5: Decoded events - consistent types across multiple rows');
const decodedRows = [
  { event_id: '1', deployment_id: 'test', contract_id: 'test', topics: JSON.stringify([['Mint']]), data: JSON.stringify({ to: 'alice' }), ledger_sequence: 100, transaction_index: 0, operation_index: 0, event_index: 0, transaction_successful: true },
  { event_id: '2', deployment_id: 'test', contract_id: 'test', topics: JSON.stringify([['Transfer']]), data: JSON.stringify({ from: 'bob', to: 'charlie' }), ledger_sequence: 101, transaction_index: 1, operation_index: 1, event_index: 1, transaction_successful: false },
  { event_id: undefined, deployment_id: undefined, contract_id: undefined, topics: JSON.stringify([['Approve']]), data: JSON.stringify({}), ledger_sequence: undefined, transaction_index: undefined, operation_index: undefined, event_index: undefined, transaction_successful: undefined }
];

const decodedResults = decodedRows.map(row => invokeDecodedEvents(row));
const decodedTypeMap = {};

for (const result of decodedResults) {
  if (result === null) continue;
  for (const field of ['event_id', 'deployment_id', 'contract_id', 'ledger_sequence', 'transaction_index', 'operation_index', 'event_index', 'transaction_successful']) {
    const currentType = result[field] === null ? 'null' : typeof result[field];
    if (!decodedTypeMap[field]) {
      decodedTypeMap[field] = currentType;
    } else if (decodedTypeMap[field] !== currentType && currentType !== 'null') {
      throw new Error(`Type inconsistency for decoded-events field "${field}": expected ${decodedTypeMap[field]} but got ${currentType}`);
    }
  }
}
console.log('✅ Passed - All rows have consistent types\n');

// Test 6: Decoded events - no undefined in string fields
console.log('Test 6: Decoded events - no undefined in string columns');
const decodedCheckResult = invokeDecodedEvents({
  event_id: 'test-id',
  deployment_id: 'test',
  contract_id: 'test',
  topics: JSON.stringify([['TestEvent']]),
  data: JSON.stringify({})
});
assert.notStrictEqual(decodedCheckResult.event_id, undefined);
assert.notStrictEqual(decodedCheckResult.deployment_id, undefined);
assert.notStrictEqual(decodedCheckResult.contract_id, undefined);
console.log('✅ Passed\n');

// ==================== ACTIVITY FEED TESTS ====================
console.log('═══════════════════════════════════════');
console.log('🔍 ACTIVITY-FEED TRANSFORM TESTS');
console.log('═══════════════════════════════════════\n');

const activityFeedFields = [
  'activity_id', 'deployment_id', 'contract_id', 'contract_role',
  'kind', 'title', 'summary', 'event_name', 'topics', 'args',
  'visibility', 'proposal_id', 'token_id', 'amount', 'actor',
  'addresses', 'ledger_sequence', 'transaction_index', 'operation_index',
  'event_index', 'ledger_closed_at', 'transaction_hash'
];

// Test 7: Activity feed - null handling
console.log('Test 7: Activity feed - null/undefined input handling');
assert.strictEqual(invokeActivityFeed(null), null);
assert.strictEqual(invokeActivityFeed(undefined), null);
console.log('✅ Passed\n');

// Test 8: Activity feed - type consistency
console.log('Test 8: Activity feed - consistent types across multiple rows');
const activityRows = [
  { event_id: '1', event_name: 'Transfer', deployment_id: 'test', contract_id: 'test', topics: '{}', ledger_sequence: 100, transaction_index: 0, operation_index: 0, event_index: 0 },
  { event_id: '2', event_name: 'Mint', deployment_id: 'test', contract_id: 'test', topics: null, ledger_sequence: 101, transaction_index: 1, operation_index: 1, event_index: 1 },
  { event_id: '3', event_name: 'Approve', deployment_id: 'test', contract_id: 'test', topics: undefined, ledger_sequence: undefined, transaction_index: undefined, operation_index: undefined, event_index: undefined }
];

const activityResults = activityRows.map(row => invokeActivityFeed(row));
const activityTypeMap = {};

for (const result of activityResults) {
  if (result === null) continue;
  for (const field of activityFeedFields) {
    const currentType = typeof result[field];
    if (!activityTypeMap[field]) {
      activityTypeMap[field] = currentType;
    } else if (activityTypeMap[field] !== currentType) {
      throw new Error(`Type inconsistency for activity-feed field "${field}": expected ${activityTypeMap[field]} but got ${currentType}`);
    }
  }
}
console.log('✅ Passed - All rows have consistent types\n');

// Test 9: Activity feed - all string fields are strings
console.log('Test 9: Activity feed - string fields are never undefined');
const activityStringResult = invokeActivityFeed({
  event_id: 'test',
  event_name: 'Transfer',
  deployment_id: 'test',
  contract_id: 'test'
});
const stringFields = ['activity_id', 'deployment_id', 'contract_id', 'kind', 'title', 'summary', 'event_name', 'topics', 'args', 'visibility', 'proposal_id', 'token_id', 'amount', 'actor', 'addresses', 'ledger_closed_at', 'transaction_hash'];
for (const field of stringFields) {
  assert.strictEqual(typeof activityStringResult[field], 'string', `${field} should be string, not ${typeof activityStringResult[field]}`);
}
console.log('✅ Passed\n');

// Test 10: Activity feed - numeric fields are numbers
console.log('Test 10: Activity feed - numeric fields are numbers');
const numericFields = ['ledger_sequence', 'transaction_index', 'operation_index', 'event_index'];
for (const field of numericFields) {
  assert.strictEqual(typeof activityStringResult[field], 'number', `${field} should be number, not ${typeof activityStringResult[field]}`);
}
console.log('✅ Passed\n');

// ==================== SUMMARY ====================
console.log('═══════════════════════════════════════');
console.log('✅ All transform tests passed!');
console.log('═══════════════════════════════════════\n');
console.log('📊 Test Summary:');
console.log('  ✓ raw-events: 3 tests - type consistency, finite numbers');
console.log('  ✓ decoded-events: 3 tests - type consistency, no undefined');
console.log('  ✓ activity-feed: 4 tests - type consistency, string/number types');
console.log('  Total: 10 tests covering all 3 transform scripts\n');
console.log('✨ All transforms are now Arrow-safe!\n');
