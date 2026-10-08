#!/usr/bin/env node
// Pre-pay (or renew) the rent for the shared contract code of a deployment.
//
// Every DAO deployed from a WASM hash shares that code entry. The rent for extending it is charged to
// whoever's transaction pushes its TTL up, so without this the first DAO creator after expiry pays for
// everyone (about 223 XLM on testnet for the first create_dao, about 2.5 XLM afterwards). The operator
// runs this instead, on a schedule, so creators pay only the instance cost.
//
// Usage: node scripts/renew-code-ttl.mjs <deploys/<label>-<network>-manager.json> [--days 30] [--identity <name>]
// Default lifetime: 30 days (the cheapest renewal that fits a monthly schedule). Max 170 days (network cap).
import { readFileSync } from 'node:fs';
import { runQuiet } from './lib.mjs';

const args = process.argv.slice(2);
const artifactPath = args.find((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
if (!artifactPath) {
  console.error('Usage: node scripts/renew-code-ttl.mjs <deploys/<label>-<network>-manager.json> [--days 30] [--identity <name>]');
  process.exit(1);
}

const days = Number(flag('--days', process.env.EXTEND_CODE_TTL_DAYS || 30));
if (!Number.isInteger(days) || days < 1 || days > 170) {
  console.error(`--days must be an integer between 1 and 170 (network cap), got ${flag('--days', '')}`);
  process.exit(1);
}
const ledgers = days * 17280;

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const networkName = artifact.network;
const identity = flag('--identity', process.env.DEPLOY_IDENTITY?.trim() || `${networkName}-admin`);
const implementations = artifact.implementations || {};

let failures = 0;
for (const [label, hash] of Object.entries({ Manager: artifact.implementations?.manager, ...implementations })) {
  if (!hash || label === 'manager') continue;
  const result = runQuiet('stellar', [
    'contract', 'extend', '--wasm-hash', hash, '--ledgers-to-extend', String(ledgers),
    '--durability', 'persistent', '--source-account', identity, '--network', networkName
  ]);
  if (result.ok) {
    console.log(`Extended ${label} code to ~${days} days (${hash.slice(0, 12)}...)`);
  } else {
    failures += 1;
    console.error(`FAILED ${label} (${hash.slice(0, 12)}...): ${(result.stderr || result.stdout).trim().split('\n').slice(-2).join(' ')}`);
  }
}

if (failures > 0) {
  console.error(`${failures} code entr${failures === 1 ? 'y' : 'ies'} not renewed.`);
  process.exit(1);
}
console.log(`All shared code renewed to ~${days} days on ${networkName}. Repeat before the lifetime runs out.`);
