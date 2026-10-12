#!/usr/bin/env node
// Platform renewal: shared contract code, the Manager and the shared Minter (docs/STORAGE_DIET.md § 7, D28).
//
// Every DAO deployed from a WASM hash shares that code entry, and contracts only ever bump code a few days
// (`common::ttl::CODE_TTL_EXTEND_TO`), so shared code is the platform's to renew. This script extends:
//   - every code hash it can find from chain: each registry name's latest implementation, the Manager's
//     and the shared Minter's running `wasm_hash()`, plus the deploy artifact's hashes and any --hash;
//   - the Manager instance, the shared Minter instance, and each found hash's `Implementation(hash)` record
//     (version() of every module reads it).
// DAO-owned keys (module instances, artwork, proposals, ...) are renewed by each DAO's own sweep.
//
// Usage: node scripts/renew-code-ttl.mjs <deploys/<label>-<network>-manager.json>
//          [--days 170] [--identity <name>] [--hash <hex>]...
// --days defaults to 170 and must be above the 4 days contracts bump code to themselves.
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CODE_TTL_DAYS,
  LEDGERS_PER_DAY,
  invokeView,
  namespacedKeyXdr,
  parseCodeTtlDays,
  runQuiet,
  scv
} from './lib.mjs';

const args = process.argv.slice(2);
const artifactPath = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const flags = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
if (!artifactPath) {
  console.error(
    'Usage: node scripts/renew-code-ttl.mjs <deploys/<label>-<network>-manager.json> [--days 170] [--identity <name>] [--hash <hex>]...'
  );
  process.exit(1);
}

let days;
try {
  days = parseCodeTtlDays(flag('--days', process.env.EXTEND_CODE_TTL_DAYS || DEFAULT_CODE_TTL_DAYS));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const ledgers = days * LEDGERS_PER_DAY;

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const network = artifact.network;
const source = flag('--identity', process.env.DEPLOY_IDENTITY?.trim() || `${network}-admin`);
const manager = artifact.manager;
const minter = artifact.minter;
const view = (id, method, callArgs = []) => invokeView(id, method, callArgs, { network, source });

// --- Collect hashes: chain first, then the artifact and explicit extras.
const hashes = new Map(); // hash -> label
const add = (hash, label) => {
  if (typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash) && !hashes.has(hash)) hashes.set(hash, label);
};
add(view(manager, 'wasm_hash'), 'Manager (running)');
if (minter) add(view(minter, 'wasm_hash'), 'Minter (running)');
for (const name of ['Manager', 'Token', 'Metadata', 'Auction', 'Governor', 'Treasury', 'Marketplace', 'Minter']) {
  const latest = view(manager, 'get_latest_implementation', ['--name', name]);
  if (latest && typeof latest === 'object') add(latest.wasm_hash, `${name} (latest)`);
}
for (const [label, hash] of Object.entries(artifact.implementations || {})) add(hash, `${label} (artifact)`);
for (const hash of flags('--hash')) add(hash, 'extra');

function extend(label, extendArgs) {
  const result = runQuiet('stellar', [
    'contract', 'extend', ...extendArgs, '--ledgers-to-extend', String(ledgers),
    '--durability', 'persistent', '--source-account', source, '--network', network
  ]);
  if (result.ok) {
    console.log(`Extended ${label} to ~${days} days`);
    return true;
  }
  console.error(`FAILED ${label}: ${(result.stderr || result.stdout).trim().split('\n').slice(-2).join(' ')}`);
  return false;
}

let failures = 0;
for (const [hash, label] of hashes) {
  if (!extend(`${label} code ${hash.slice(0, 12)}...`, ['--wasm-hash', hash])) failures += 1;
  const record = view(manager, 'get_implementation', ['--wasm_hash', hash]);
  if (record && typeof record === 'object') {
    const key = namespacedKeyXdr('Implementation', scv.bytes(Buffer.from(hash, 'hex')));
    if (!extend(`${label} registry record`, ['--id', manager, '--key-xdr', key])) failures += 1;
  }
}
if (!extend('Manager instance', ['--id', manager])) failures += 1;
if (minter && !extend('shared Minter instance', ['--id', minter])) failures += 1;

if (failures > 0) {
  console.error(`${failures} entr${failures === 1 ? 'y' : 'ies'} not renewed.`);
  process.exit(1);
}
console.log(`Platform entries renewed to ~${days} days on ${network}. Repeat before the lifetime runs out.`);
