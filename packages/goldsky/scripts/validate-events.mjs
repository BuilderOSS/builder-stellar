#!/usr/bin/env node
/**
 * Event Coverage Validator
 *
 * Validates that the Goldsky event decoder handles all events defined in the
 * generated TypeScript bindings from the Soroban smart contracts.
 *
 * This ensures the decoder stays in sync with the contract specifications.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import all binding types to get event names
import * as TokenTypes from '@stellar-dao/token-bindings';
import * as GovernorTypes from '@stellar-dao/governor-bindings';
import * as TreasuryTypes from '@stellar-dao/treasury-bindings';
import * as AuctionTypes from '@stellar-dao/auction-bindings';

/**
 * Extract event names from binding type files
 */
function getEventsFromBindings() {
  const events = {
    token: extractEventNames('../../token-bindings/src/types.ts'),
    governor: extractEventNames('../../governor-bindings/src/types.ts'),
    treasury: extractEventNames('../../treasury-bindings/src/types.ts'),
    auction: extractEventNames('../../auction-bindings/src/types.ts')
  };

  return events;
}

/**
 * Extract event interface names from a types.ts file
 */
function extractEventNames(relativePath) {
  const filePath = join(__dirname, relativePath);
  const content = readFileSync(filePath, 'utf8');

  // Match: export interface SomeEvent {
  const eventInterfaceRegex = /export interface (\w+Event)\s*{/g;
  const matches = [...content.matchAll(eventInterfaceRegex)];

  return matches.map(match => {
    const interfaceName = match[1]; // e.g., "MintEvent"
    // Convert to event name: MintEvent -> Mint (remove "Event" suffix)
    return interfaceName.replace(/Event\d*$/, ''); // Remove Event and optional number
  });
}

/**
 * Extract handled event names from decoded-events.script.js
 */
function getEventsFromDecoder() {
  const decoderPath = join(__dirname, '../src/decoded-events.script.js');
  const content = readFileSync(decoderPath, 'utf8');

  // Match event name checks in the decoder
  // Pattern: eventName === 'some_event' || eventName === 'SomeEvent'
  const eventNameRegex = /eventName === ['"](\w+)['"]/g;
  const matches = [...content.matchAll(eventNameRegex)];

  const eventNames = new Set();
  matches.forEach(match => {
    const name = match[1];
    // Normalize to PascalCase
    const normalized = name.charAt(0).toUpperCase() + name.slice(1).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    eventNames.add(normalized);
  });

  return Array.from(eventNames).sort();
}

/**
 * Main validation logic
 */
function validateEventCoverage() {
  console.log('🔍 Validating Goldsky Event Decoder Coverage...\n');

  const bindingEvents = getEventsFromBindings();
  const decoderEvents = new Set(getEventsFromDecoder());

  let allEvents = [];
  let missingEvents = [];
  let extraEvents = [];

  // Check coverage for each contract
  for (const [contract, events] of Object.entries(bindingEvents)) {
    const uniqueEvents = [...new Set(events)]; // Remove duplicates
    allEvents.push(...uniqueEvents.map(e => ({ contract, event: e })));

    console.log(`📋 ${contract.toUpperCase()} Contract:`);
    console.log(`   Events in bindings: ${uniqueEvents.length}`);

    const missing = uniqueEvents.filter(e => !decoderEvents.has(e));
    if (missing.length > 0) {
      console.log(`   ❌ Missing in decoder: ${missing.length}`);
      missingEvents.push(...missing.map(e => ({ contract, event: e })));
    } else {
      console.log(`   ✅ All events handled`);
    }
    console.log('');
  }

  // Check for events in decoder but not in bindings (potentially removed from contracts)
  const allBindingEvents = new Set(allEvents.map(e => e.event));
  extraEvents = Array.from(decoderEvents).filter(e => !allBindingEvents.has(e));

  // Summary
  console.log('📊 Summary:');
  console.log(`   Total unique events in bindings: ${allBindingEvents.size}`);
  console.log(`   Total events handled in decoder: ${decoderEvents.size}`);
  console.log(`   Coverage: ${Math.round((decoderEvents.size / allBindingEvents.size) * 100)}%`);
  console.log('');

  // Report issues
  if (missingEvents.length > 0) {
    console.log('❌ Missing Events (in bindings but not decoder):');
    missingEvents.forEach(({ contract, event }) => {
      console.log(`   - ${contract}: ${event}`);
    });
    console.log('');
  }

  if (extraEvents.length > 0) {
    console.log('⚠️  Extra Events (in decoder but not bindings):');
    extraEvents.forEach(event => {
      console.log(`   - ${event}`);
    });
    console.log('');
  }

  if (missingEvents.length === 0 && extraEvents.length === 0) {
    console.log('✅ Perfect! All events from bindings are handled in the decoder.');
    return 0;
  } else {
    console.log('⚠️  Event coverage validation found discrepancies.');
    return 1;
  }
}

// Run validation
const exitCode = validateEventCoverage();
process.exit(exitCode);
