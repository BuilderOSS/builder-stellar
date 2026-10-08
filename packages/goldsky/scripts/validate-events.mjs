#!/usr/bin/env node
/**
 * Event Coverage Validator
 *
 * Verifies that the Goldsky decoder's topic-name map matches every event the
 * Soroban contracts (and the OpenZeppelin library events they emit) actually
 * publish. The Rust sources are the source of truth, not generated bindings,
 * which can lag behind the contracts.
 */
import { contractEventList, findDecoderDrift, LIBRARY_EVENTS } from '../src/contract-events.mjs';

console.log('🔍 Validating Goldsky decoder against contract events...\n');

const byContract = {};
for (const { contract, name } of contractEventList()) {
  (byContract[contract] ??= []).push(name);
}
for (const [contract, names] of Object.entries(byContract).sort()) {
  console.log(`📋 ${contract.toUpperCase()}: ${names.length} events`);
}
console.log(`📋 LIBRARY: ${Object.keys(LIBRARY_EVENTS).length} events\n`);

const problems = findDecoderDrift();
if (problems.length === 0) {
  console.log('✅ Decoder topic names match every contract and library event.');
  process.exit(0);
}
console.log('❌ Decoder drift:');
problems.forEach((problem) => console.log(`   - ${problem}`));
process.exit(1);
