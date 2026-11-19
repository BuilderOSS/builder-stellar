#!/usr/bin/env node
// node apps/e2e/scripts/w05-drive-fixtures.mjs [ready|fail|both]
//
// Fixture tribes for W05 (launch drives), on the dev Manager. Each run makes NEW tribes, because a
// drive is one-shot: a launched drive claims its link for good and a failed one can only refund.
//   1. writes configs/e2e-walk-<slug>-dao.json (modelled on configs/testnet-builder-claims-dao.json):
//      a claims module paid in XLM, governance at the 300s minimums, one founder token for the
//      timeline's founder, the starter artwork;
//   2. runs scripts/deploy-dao.mjs create_dao and admin_checklist as the timeline's founder
//      (DEPLOY_IDENTITY=e2e-<timeline>-founder), which writes deploys/dev-testnet-dao-<nonce>.json;
//   3. opens the launch drive (manager.open_assurance): a list of member-a and member-b, one token
//      each at 1 XLM, two people needed. "ready" closes in a day; "fail" closes after
//      E2E_FAIL_WINDOW_S (default 600s), so W05 can claim, wait it out, and refund.
// The drive's tree_uri is a placeholder (the walkthrough build can't upload to IPFS), so members claim
// with the proof file the claims page accepts; the proofs land in apps/e2e/fixtures/w05-drives.json.
// Nonces count up from 301 (the first unused deploys/dev-testnet-dao-<n>.json). Testnet only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Address } from '@stellar/stellar-sdk';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const timeline = process.env.E2E_TIMELINE?.trim() || 'w03';
const which = process.argv[2] ?? 'both';
if (!['ready', 'fail', 'both'].includes(which)) throw new Error('Usage: w05-drive-fixtures.mjs [ready|fail|both]');
const NETWORK_CONFIG = 'configs/testnet-dev-manager.json';
const XLM_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const PRICE = 10_000_000n; // 1 XLM per token
const FAIL_WINDOW_S = Number(process.env.E2E_FAIL_WINDOW_S || 600);
const OUT = resolve(root, 'apps/e2e/fixtures/w05-drives.json');

const network = JSON.parse(readFileSync(resolve(root, NETWORK_CONFIG), 'utf8'));
if (network.network !== 'testnet') throw new Error('Testnet only.');
const manager = JSON.parse(readFileSync(resolve(root, `deploys/${network.label}-testnet-manager.json`), 'utf8')).manager;
const identity = (role) => `e2e-${timeline}-${role}`;
const address = (role) =>
  execFileSync('stellar', ['keys', 'address', identity(role)], { encoding: 'utf8' }).trim();

function nextNonce(taken = new Set()) {
  for (let nonce = 301; ; nonce += 1)
    if (!taken.has(nonce) && !existsSync(resolve(root, `deploys/${network.label}-testnet-dao-${nonce}.json`))) return nonce;
}

/** Leaf and node hashing as contracts/minter (sha256(scval_xdr(address) || u128_be(amount)), sorted pairs). */
function leaf(recipient, amount) {
  const be128 = Buffer.from(BigInt(amount).toString(16).padStart(32, '0'), 'hex');
  return createHash('sha256').update(Buffer.concat([new Address(recipient).toScVal().toXDR(), be128])).digest();
}
function twoLeafTree(a, b) {
  const [la, lb] = [leaf(a, 1), leaf(b, 1)];
  const pair = Buffer.compare(la, lb) <= 0 ? [la, lb] : [lb, la];
  return {
    root: createHash('sha256').update(Buffer.concat(pair)).digest('hex'),
    proofs: { [a]: [lb.toString('hex')], [b]: [la.toString('hex')] }
  };
}

function run(cmd, args, env = {}) {
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
}

function makeDrive(kind, nonce) {
  const founder = address('founder');
  const members = { 'e2e-member-a': address('member-a'), 'e2e-member-b': address('member-b') };
  const slug = `e2e-${timeline}-drive-${kind}-${nonce}`;
  const template = JSON.parse(readFileSync(resolve(root, 'configs/testnet-builder-claims-dao.json'), 'utf8'));
  const name = `E2E ${timeline.toUpperCase()} Drive ${kind === 'ready' ? 'Ready' : 'Fail'} ${nonce}`;
  const config = {
    $comment: `W05 fixture (${kind} launch drive). Recreate with: node apps/e2e/scripts/w05-drive-fixtures.mjs ${kind}`,
    deployer: founder,
    nonce,
    launchAdmin: founder,
    slug,
    token: { name, symbol: `EWD${kind === 'ready' ? 'R' : 'F'}` },
    metadata: {
      ...template.metadata,
      profile: { ...template.metadata.profile, description: `${name}: a walkthrough launch drive on testnet.` },
      rendererBase: 'https://dev.tribes.build/api/render'
    },
    claims: { paymentAsset: XLM_SAC },
    governance: { queueDelay: 300, votingDelay: 300, votingPeriod: 300, quorumBps: 1000, proposalThreshold: 1 },
    founders: [{ address: founder, amount: 1 }],
    launch: { launchAuction: false, launchMarketplace: false },
    tokenSettings: { transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false }
  };
  config.metadata.profile.image = 'https://dev.tribes.build/images/dao-logo.png';
  const configPath = `configs/e2e-walk-${slug}-dao.json`;
  writeFileSync(resolve(root, configPath), `${JSON.stringify(config, null, 2)}\n`);
  const env = { DEPLOY_IDENTITY: identity('founder') };
  run('node', ['scripts/deploy-dao.mjs', 'create_dao', configPath, NETWORK_CONFIG], env);
  run('node', ['scripts/deploy-dao.mjs', 'admin_checklist', configPath, NETWORK_CONFIG], env);
  const artifactPath = `deploys/${network.label}-testnet-dao-${nonce}.json`;
  const daoId = JSON.parse(readFileSync(resolve(root, artifactPath), 'utf8')).addresses.token;

  const tree = twoLeafTree(members['e2e-member-a'], members['e2e-member-b']);
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + (kind === 'ready' ? 86_400 : FAIL_WINDOW_S);
  const list = {
    root: { bytes: tree.root },
    tree_uri: `ipfs://bafkreie2e${timeline}${kind}${nonce}/tree.json`,
    price: { i128: String(PRICE) },
    expires_at: { u64: String(now + 7 * 86_400) },
    total: 2,
    threshold_claimers: 2,
    deadline: { u64: String(deadline) }
  };
  run('stellar', [
    'contract', 'invoke', '--id', manager, '--source-account', identity('founder'), '--network', 'testnet', '--send', 'yes',
    '--', 'open_assurance', '--token_address', daoId, '--list', JSON.stringify(list),
    '--launch_config', JSON.stringify({ launch_auction: false, launch_marketplace: false })
  ]);
  return {
    daoId,
    name,
    slug,
    nonce,
    config: configPath,
    artifact: artifactPath,
    root: tree.root,
    deadline,
    priceStroops: String(PRICE),
    threshold: 2,
    proofs: Object.fromEntries(
      Object.entries(members).map(([role, member]) => [role, { address: member, amount: '1', proof: tree.proofs[member] }])
    )
  };
}

const fixtures = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const taken = new Set();
for (const kind of which === 'both' ? ['ready', 'fail'] : [which]) {
  const nonce = nextNonce(taken);
  taken.add(nonce);
  console.info(`\n=== W05 ${kind} drive, nonce ${nonce} ===`);
  fixtures[kind] = makeDrive(kind, nonce);
  writeFileSync(OUT, `${JSON.stringify(fixtures, null, 2)}\n`);
}
console.info(`\nWrote ${OUT}`);
