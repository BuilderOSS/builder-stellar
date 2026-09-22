import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the transform script
const scriptContent = readFileSync(join(__dirname, '../src/activity-feed.script.js'), 'utf-8');

// Extract and execute the function
const invoke = eval(`(${scriptContent})`);

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

function testNoNull(obj, fieldName) {
  const value = obj[fieldName];
  assert.notStrictEqual(
    value,
    null,
    `Field "${fieldName}" should never be null. Value: ${JSON.stringify(value)}`
  );
  assert.notStrictEqual(
    value,
    undefined,
    `Field "${fieldName}" should never be undefined. Value: ${JSON.stringify(value)}`
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

const requiredFields = [
  'activity_id', 'deployment_id', 'contract_id', 'contract_role',
  'kind', 'title', 'summary', 'event_name', 'topics', 'args',
  'visibility', 'proposal_id', 'token_id', 'amount', 'actor',
  'addresses', 'ledger_sequence', 'transaction_index', 'operation_index',
  'event_index', 'ledger_closed_at', 'transaction_hash'
];

// Test Suite
console.log('🧪 Running activity-feed transform tests...\n');

// Test 1: Null input handling
console.log('Test 1: Null input handling');
assert.strictEqual(invoke(null), null, 'Should return null for null input');
assert.strictEqual(invoke(undefined), null, 'Should return null for undefined input');
console.log('✅ Passed\n');

// Test 2: Missing event_name handling
console.log('Test 2: Missing event_name handling');
assert.strictEqual(invoke({ deployment_id: 'test', contract_id: 'test' }), null, 'Should return null when event_name missing');
console.log('✅ Passed\n');

// Test 3: Minimal valid input - all fields initialized
console.log('Test 3: Minimal valid input with all required fields');
const minimalInput = {
  event_id: 'event-123',
  event_name: 'Transfer',
  deployment_id: 'manager:ABC123',
  contract_id: 'CONTRACT123'
};
const minimalResult = invoke(minimalInput);
assert.ok(minimalResult, 'Should return an object for valid input');
testAllFieldsPresent(minimalResult, requiredFields);
console.log('✅ Passed\n');

// Test 4: Type consistency - all string fields
console.log('Test 4: Type consistency for string fields');
const stringFields = [
  'activity_id', 'deployment_id', 'contract_id', 'contract_role',
  'kind', 'title', 'summary', 'event_name', 'topics', 'args',
  'visibility', 'proposal_id', 'token_id', 'amount', 'actor',
  'addresses', 'ledger_closed_at', 'transaction_hash'
];
for (const field of stringFields) {
  testTypeConsistency(minimalResult, field, 'string');
  testNoNull(minimalResult, field);
}
console.log('✅ Passed\n');

// Test 5: Type consistency - all numeric fields
console.log('Test 5: Type consistency for numeric fields');
const numericFields = ['ledger_sequence', 'transaction_index', 'operation_index', 'event_index'];
for (const field of numericFields) {
  testTypeConsistency(minimalResult, field, 'number');
  testNoNull(minimalResult, field);
  assert.ok(Number.isFinite(minimalResult[field]), `Field "${field}" should be a finite number`);
}
console.log('✅ Passed\n');

// Test 6: Null/undefined fields default correctly
console.log('Test 6: Null/undefined fields default correctly');
const withNulls = {
  event_id: null,
  event_name: 'Transfer',
  deployment_id: null,
  contract_id: undefined,
  topics: null,
  args: undefined,
  ledger_sequence: null,
  transaction_index: undefined
};
const withNullsResult = invoke(withNulls);
assert.strictEqual(withNullsResult.activity_id, '', 'Null event_id should default to empty string');
assert.strictEqual(withNullsResult.deployment_id, '', 'Null deployment_id should default to empty string');
assert.strictEqual(withNullsResult.contract_id, '', 'Undefined contract_id should default to empty string');
assert.strictEqual(withNullsResult.topics, '{}', 'Null topics should default to "{}"');
assert.strictEqual(withNullsResult.args, '{}', 'Undefined args should default to "{}"');
assert.strictEqual(withNullsResult.ledger_sequence, 0, 'Null ledger_sequence should default to 0');
assert.strictEqual(withNullsResult.transaction_index, 0, 'Undefined transaction_index should default to 0');
console.log('✅ Passed\n');

// Test 7: JSON fields are valid JSON strings
console.log('Test 7: JSON fields are valid JSON strings');
const jsonFields = ['topics', 'args', 'addresses'];
for (const field of jsonFields) {
  const value = minimalResult[field];
  assert.strictEqual(typeof value, 'string', `${field} should be a string`);
  try {
    JSON.parse(value);
  } catch (e) {
    throw new Error(`${field} contains invalid JSON: ${value}`);
  }
}
console.log('✅ Passed\n');

// Test 8: Summary generation with various event types
console.log('Test 8: Summary generation with various event types');
const eventTests = [
  {
    name: 'ProposalQueued',
    input: { event_id: '1', event_name: 'ProposalQueued', deployment_id: 'test', contract_id: 'test', proposal_id: '42' },
    expectedSummary: 'Proposal 42 queued'
  },
  {
    name: 'Mint',
    input: { event_id: '2', event_name: 'Mint', deployment_id: 'test', contract_id: 'test', token_id: '100', to: 'ALICE' },
    expectedSummary: 'Minted token 100 to ALICE'
  },
  {
    name: 'BidPlaced',
    input: { event_id: '3', event_name: 'BidPlaced', deployment_id: 'test', contract_id: 'test', amount: '1000', token_id: '5' },
    expectedSummary: 'Bid of 1000 placed on token 5'
  },
  {
    name: 'UnknownEvent',
    input: { event_id: '4', event_name: 'SomeUnknownEvent', deployment_id: 'test', contract_id: 'test' },
    expectedSummary: 'SomeUnknownEvent'  // Unknown events get their name with underscores replaced by spaces
  }
];

for (const test of eventTests) {
  const result = invoke(test.input);
  assert.strictEqual(
    result.summary,
    test.expectedSummary,
    `Event ${test.name}: expected summary "${test.expectedSummary}" but got "${result.summary}"`
  );
}
console.log('✅ Passed\n');

// Test 9: Topic values survive the decoded_events schema boundary
console.log('Test 9: Topic-only token IDs are included in summaries');
const topicOnlyEvents = [
  {
    event_name: 'AuctionCreated',
    topics: JSON.stringify({ token_id: '30' }),
    args: '{}',
    expectedSummary: 'Auction created for token 30'
  },
  {
    event_name: 'SeedGenerated',
    topics: JSON.stringify({ token_id: '30' }),
    args: '{}',
    expectedSummary: 'Seed generated for token 30'
  }
];

for (const event of topicOnlyEvents) {
  const result = invoke({
    event_id: event.event_name,
    deployment_id: 'test',
    contract_id: 'test',
    ...event
  });
  assert.strictEqual(result.token_id, '30');
  assert.strictEqual(result.summary, event.expectedSummary);
}
console.log('✅ Passed\n');

// Test 10: Kind mapping
console.log('Test 10: Kind mapping for known events');
const result = invoke({
  event_id: '5',
  event_name: 'Transfer',
  deployment_id: 'test',
  contract_id: 'test'
});
assert.strictEqual(result.kind, 'token.transfer', 'Transfer event should map to token.transfer kind');
console.log('✅ Passed\n');

// Test 11: Visibility assignment
console.log('Test 11: Visibility assignment based on event type');
const governanceResult = invoke({
  event_id: '6',
  event_name: 'VoteCast',
  deployment_id: 'test',
  contract_id: 'test'
});
assert.strictEqual(governanceResult.visibility, 'governance', 'VoteCast should have governance visibility');

const tokenResult = invoke({
  event_id: '7',
  event_name: 'Mint',
  deployment_id: 'test',
  contract_id: 'test'
});
assert.strictEqual(tokenResult.visibility, 'public', 'Mint should have public visibility');

const adminResult = invoke({
  event_id: '8',
  event_name: 'MintAuthorityChanged',
  deployment_id: 'test',
  contract_id: 'test'
});
assert.strictEqual(adminResult.visibility, 'admin', 'MintAuthorityChanged should have admin visibility');
console.log('✅ Passed\n');

// Test 12: Addresses array handling
console.log('Test 12: Addresses array handling');
const addressesResult = invoke({
  event_id: '9',
  event_name: 'Transfer',
  deployment_id: 'test',
  contract_id: 'test',
  owner: 'BOB',
  actor: 'CHARLIE',
  proposer: 'ALICE'
});
const addresses = JSON.parse(addressesResult.addresses);
assert.ok(Array.isArray(addresses), 'addresses should be a JSON array');
assert.ok(addresses.includes('CHARLIE'), 'addresses should contain actor address');
assert.ok(addresses.includes('BOB'), 'addresses should contain owner address');
assert.ok(addresses.includes('ALICE'), 'addresses should contain proposer address');
console.log('✅ Passed\n');

// Test 13: Multiple rows consistency (Arrow type inference test)
console.log('Test 13: Type consistency across multiple rows (Arrow simulation)');
const rows = [
  { event_id: '1', event_name: 'Mint', deployment_id: 'test', contract_id: 'test', topics: '{}', ledger_sequence: 100 },
  { event_id: '2', event_name: 'Transfer', deployment_id: 'test', contract_id: 'test', topics: null, ledger_sequence: 101 },
  { event_id: '3', event_name: 'Approve', deployment_id: 'test', contract_id: 'test', topics: undefined, ledger_sequence: 102 },
  { event_id: '4', event_name: 'Burn', deployment_id: 'test', contract_id: 'test', topics: { key: 'value' }, ledger_sequence: null }
];

const results = rows.map(row => invoke(row));
const typeMap = {};

for (const result of results) {
  for (const field of requiredFields) {
    const currentType = typeof result[field];
    if (!typeMap[field]) {
      typeMap[field] = currentType;
    } else if (typeMap[field] !== currentType) {
      throw new Error(`Type inconsistency for field "${field}": expected ${typeMap[field]} but got ${currentType}`);
    }
  }
}
console.log('✅ Passed - All rows have consistent types\n');

// Test 14: Empty/edge case values
console.log('Test 14: Empty/edge case values');
const edgeCaseResult = invoke({
  event_id: '',
  event_name: 'Transfer',
  deployment_id: '',
  contract_id: '',
  topics: '',
  args: '   ',
  proposal_id: '',
  token_id: null,
  actor: undefined
});
assert.strictEqual(edgeCaseResult.event_name, 'Transfer', 'event_name should be preserved');
assert.strictEqual(edgeCaseResult.topics, '{}', 'Empty topics should default to {}');
assert.strictEqual(edgeCaseResult.token_id, '', 'Null token_id should default to empty string');
assert.strictEqual(edgeCaseResult.actor, '', 'Undefined actor should default to empty string');
console.log('✅ Passed\n');

// Summary
console.log('═══════════════════════════════════════');
console.log('✅ All 14 tests passed!');
console.log('═══════════════════════════════════════');
console.log('\n📊 Test Coverage:');
console.log('  • Null/undefined input handling');
console.log('  • Field type consistency across rows');
console.log('  • Default value initialization');
console.log('  • JSON field validation');
console.log('  • Summary generation logic');
console.log('  • Event kind and visibility mapping');
console.log('  • Address array construction');
console.log('  • Arrow type inference simulation');
console.log('  • Edge case handling\n');
