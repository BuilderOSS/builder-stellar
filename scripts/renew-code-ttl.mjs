#!/usr/bin/env node
// Platform renewal: shared contract code, the Manager and the shared Minter (docs/STORAGE_DIET.md § 7, D28).
//
// Every DAO deployed from a WASM hash shares that code entry, and contracts only ever bump code a few days
// (`common::ttl::CODE_TTL_EXTEND_TO`), so shared code is the platform's to renew. This script extends:
//   - every code hash in use or about to be: the Manager's and the shared Minter's running `wasm_hash()`,
//     the Manager's `current_implementations()` (what `create_dao` deploys) and each name's latest
//     implementation, the hash every known DAO module runs, plus the artifact's hashes and any --hash;
//   - the Manager instance, the shared Minter instance, each hash's `Implementation(hash)` record (every
//     `version()` reads it), the `PlatformMinter` pointer and each `LatestImplementation(name)` record.
// DAO-owned keys (module instances, artwork, proposals, holdings) are renewed by each DAO's own sweep
// (scripts/renew-dao.mjs).
//
// DAOs are found from the DAO deploy artifacts for this Manager in deploys/, any --token, and, with
// DATABASE_URL set, every DAO the indexer knows (manager.module_versions). A DAO that upgraded runs a
// hash no registry pointer names any more; reading what each DAO runs is how those stay alive.
//
// Each extension is simulated first. One that would carry more than SAFE_RESOURCE_FEE_STROOPS (a fresh
// large code entry to 170 days comes close to the u32 total-fee cap) is done in steps.
//
// Usage: node scripts/renew-code-ttl.mjs <deploys/<label>-<network>-manager.json>
//          [--days 170] [--identity <name>] [--hash <hex>]... [--token <C...>]... [--dry-run]
// --days defaults to 170 and must be above the 4 days contracts bump code to themselves.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  DEFAULT_CODE_TTL_DAYS,
  extendWithinFeeCap,
  invokeView,
  namespacedKeyXdr,
  parseCodeTtlDays,
  runQuiet,
  scv
} from './lib.mjs';

const MODULE_NAMES = ['Manager', 'Token', 'Metadata', 'Auction', 'Governor', 'Treasury', 'Marketplace', 'Minter'];

const args = process.argv.slice(2);
const artifactPath = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const flags = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
if (!artifactPath) {
  console.error(
    'Usage: node scripts/renew-code-ttl.mjs <deploys/<label>-<network>-manager.json> [--days 170] [--identity <name>] [--hash <hex>]... [--token <C...>]... [--dry-run]'
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
const dryRun = args.includes('--dry-run');

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const network = artifact.network;
const source = flag('--identity', process.env.DEPLOY_IDENTITY?.trim() || `${network}-admin`);
const manager = artifact.manager;
const minter = artifact.minter;
const view = (id, method, callArgs = []) => invokeView(id, method, callArgs, { network, source });
const tryView = (id, method, callArgs = []) => {
  try {
    return view(id, method, callArgs);
  } catch {
    return null;
  }
};

// --- Collect hashes.
const hashes = new Map(); // hash -> label
const add = (hash, label) => {
  if (typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash) && !hashes.has(hash)) hashes.set(hash, label);
};
// The Manager must answer: if its code or instance has archived, a silent run would renew only
// what the artifact names and report success (STORAGE_DIET contract review L5).
const managerHash = tryView(manager, 'wasm_hash');
if (typeof managerHash !== 'string') {
  console.error(
    `Cannot read manager.wasm_hash() on ${manager}: its code or instance may have archived. ` +
      'Restore it (stellar contract restore --id <manager>, then --wasm-hash <hash>) before renewing.'
  );
  process.exit(1);
}
add(managerHash, 'Manager (running)');
if (minter) add(tryView(minter, 'wasm_hash'), 'Minter (running)');
const current = tryView(manager, 'current_implementations');
if (current && typeof current === 'object') {
  for (const [module, hash] of Object.entries(current)) add(hash, `${module} (current)`);
}
const latestNames = [];
for (const name of MODULE_NAMES) {
  const latest = tryView(manager, 'get_latest_implementation', ['--name', name]);
  if (latest && typeof latest === 'object') {
    add(latest.wasm_hash, `${name} (latest)`);
    latestNames.push(name);
  }
}

// DAOs: artifacts for this Manager, --token, and the indexer.
const tokens = new Set(flags('--token'));
const deploysDir = dirname(artifactPath);
for (const file of readdirSync(deploysDir)) {
  if (!/-dao-\d+\.json$/.test(file)) continue;
  try {
    const dao = JSON.parse(readFileSync(join(deploysDir, file), 'utf8'));
    if (dao.manager === manager && dao.addresses?.token) tokens.add(dao.addresses.token);
  } catch {
    // not a DAO artifact
  }
}
if (!process.env.DATABASE_URL) {
  console.warn(
    'Indexer not consulted (DATABASE_URL unset): only DAOs with a deploy artifact or passed with --token are checked. ' +
      'A DAO created from the web app that skipped an upgrade may run a hash this run does not see.'
  );
}
if (process.env.DATABASE_URL) {
  const r = runQuiet('psql', [
    process.env.DATABASE_URL,
    '-At',
    '-c',
    `SELECT DISTINCT current_hash FROM manager.module_versions WHERE deployment_id = 'manager:${manager}'`
  ]);
  if (r.ok) {
    for (const hash of r.stdout.split('\n')) add(hash.trim(), 'in use (indexer)');
  } else {
    console.warn(`Indexer lookup skipped: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
  }
}
for (const token of tokens) {
  const modules = { token };
  for (const getter of ['metadata', 'treasury', 'auction', 'marketplace']) {
    const address = tryView(token, getter);
    if (typeof address === 'string' && address.startsWith('C')) modules[getter] = address;
  }
  if (modules.treasury) {
    const governor = tryView(modules.treasury, 'governor');
    if (typeof governor === 'string') modules.governor = governor;
  }
  for (const [module, address] of Object.entries(modules)) {
    add(tryView(address, 'wasm_hash'), `${module} of ${token.slice(0, 6)}… (running)`);
  }
}
for (const [label, hash] of Object.entries(artifact.implementations || {})) add(hash, `${label} (artifact)`);
for (const hash of flags('--hash')) add(hash, 'extra');

// --- Extend.
let failures = 0;
function extend(label, selector) {
  try {
    const steps = extendWithinFeeCap(selector, days, {
      network,
      source,
      dryRun
    });
    const detail = steps.map((s) => `${s.days} d for ${(Number(s.fee) / 1e7).toFixed(2)} XLM`).join(', then ');
    console.log(`${dryRun ? 'Would extend' : 'Extended'} ${label}: ${detail}`);
  } catch (e) {
    failures += 1;
    console.error(`FAILED ${label}: ${e.message.split('\n').slice(-2).join(' ')}`);
  }
}

for (const [hash, label] of hashes) {
  extend(`${label} code ${hash.slice(0, 12)}…`, ['--wasm-hash', hash]);
  const record = tryView(manager, 'get_implementation', ['--wasm_hash', hash]);
  if (record && typeof record === 'object') {
    const key = namespacedKeyXdr('Implementation', scv.bytes(Buffer.from(hash, 'hex')));
    extend(`${label} registry record`, ['--id', manager, '--key-xdr', key]);
  }
}
for (const name of latestNames) {
  extend(`latest ${name} pointer`, [
    '--id',
    manager,
    '--key-xdr',
    namespacedKeyXdr('LatestImplementation', scv.string(name))
  ]);
}
if (minter) extend('platform Minter pointer', ['--id', manager, '--key-xdr', namespacedKeyXdr('PlatformMinter')]);
extend('Manager instance', ['--id', manager]);
if (minter) extend('shared Minter instance', ['--id', minter]);

if (failures > 0) {
  console.error(`${failures} entr${failures === 1 ? 'y' : 'ies'} not renewed.`);
  process.exit(1);
}
console.log(
  dryRun
    ? `Dry run: nothing was sent (${hashes.size} code hashes, ${tokens.size} DAOs).`
    : `Platform entries renewed to ~${days} days on ${network} (${hashes.size} code hashes, ${tokens.size} DAOs). Repeat before the lifetime runs out.`
);
