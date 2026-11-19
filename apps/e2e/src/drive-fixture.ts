import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildClaimTree, claimTreeJson } from '../../web/src/lib/minter/tree.ts';
import { timelineKeyName } from './identities.ts';
import { TESTNET_PASSPHRASE } from './network.ts';
import { E2E_MANAGER_ARTIFACT, REPO_ROOT } from './preflight.ts';

/**
 * A failed launch drive for W12's refund (docs/qa/WALKTHROUGHS.md, "W12 claims fixtures").
 *
 * A refund needs a drive whose deadline passed before launch, and a tribe has one drive for
 * life, so every run makes its own tribe: create_dao and admin_checklist with scripts/deploy-dao.mjs,
 * then manager.open_assurance with a deadline minutes away. The app's own form only offers whole
 * days, so the drive is opened here; claiming and taking the payment back go through the app.
 *
 * deploy-dao.mjs writes deploys/<label>-testnet-dao-<nonce>.json for the Manager artifact
 * deploys/<label>-testnet-manager.json. A relabelled copy of the dev Manager's artifact keeps these
 * per-run artifacts in the gitignored deploys/e2e-* files, as scripts/e2e-membership.mjs does.
 */
const LABEL = `e2e-${process.env.E2E_TIMELINE?.trim() || 'walk'}-drive`;
const TEMPLATE = 'configs/e2e-walk-e2e-w06-2-dao.json';

/** CIDv1 (raw codec, sha2-256) of some bytes, as `ipfs add --cid-version 1 --raw-leaves` prints it. */
export function rawCid(bytes: Uint8Array | string) {
  const digest = createHash('sha256').update(bytes).digest();
  const cid = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of cid) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return `b${out}`;
}

function stellarJson(args: string[]): unknown {
  const out = execFileSync('stellar', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const last = out.split('\n').filter(Boolean).pop() ?? 'null';
  return JSON.parse(last);
}

function deployDao(phase: string, configPath: string, networkPath: string, identity: string) {
  execFileSync('node', ['scripts/deploy-dao.mjs', phase, configPath, networkPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, DEPLOY_IDENTITY: identity },
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

export type Drive = {
  daoId: string;
  claims: string;
  listId: number;
  deadline: number;
  price: bigint;
  /** Each claimer's proof file ({ amount, proof }), as the organizer would hand it out. */
  proofs: Record<string, { amount: string; proof: string[] }>;
};

/**
 * Create a Setup tribe and open a drive on it: `claimers` may each claim one token at `price`;
 * the drive needs one more claimer than the list has, so it can only fail, `windowS` from now.
 */
export function createFailingDrive({
  claimers,
  price,
  windowS
}: {
  claimers: string[];
  price: bigint;
  windowS: number;
}): Drive {
  const founder = timelineKeyName('e2e-founder');
  const admin = execFileSync('stellar', ['keys', 'address', founder], { encoding: 'utf8' }).trim();
  const nonce = Math.floor(Date.now() / 1000);
  const dir = mkdtempSync(join(tmpdir(), 'e2e-drive-'));

  const manager = JSON.parse(readFileSync(E2E_MANAGER_ARTIFACT, 'utf8')) as Record<string, unknown> & {
    manager: string;
  };
  writeFileSync(
    resolve(REPO_ROOT, `deploys/${LABEL}-testnet-manager.json`),
    `${JSON.stringify({ ...manager, label: LABEL, rehearsalOf: E2E_MANAGER_ARTIFACT }, null, 2)}\n`
  );
  const network = JSON.parse(readFileSync(resolve(REPO_ROOT, 'configs/testnet-dev-manager.json'), 'utf8'));
  const networkPath = join(dir, 'network.json');
  writeFileSync(networkPath, JSON.stringify({ ...network, label: LABEL }));

  const template = JSON.parse(readFileSync(resolve(REPO_ROOT, TEMPLATE), 'utf8'));
  delete template.$comment;
  const config = {
    ...template,
    deployer: admin,
    launchAdmin: admin,
    nonce,
    slug: `e2e-drive-${nonce}`,
    token: { name: 'E2E Drive', symbol: 'E2ED' },
    founders: [{ address: admin, amount: 1 }]
  };
  const configPath = join(dir, 'dao.json');
  writeFileSync(configPath, JSON.stringify(config));
  deployDao('create_dao', configPath, networkPath, founder);
  deployDao('admin_checklist', configPath, networkPath, founder);
  const artifact = JSON.parse(
    readFileSync(resolve(REPO_ROOT, `deploys/${LABEL}-testnet-dao-${nonce}.json`), 'utf8')
  ) as { addresses: { token: string; claims: string } };
  const { token, claims } = artifact.addresses;

  const listId = Number(
    stellarJson(['contract', 'invoke', '--id', claims, '--source-account', founder, '--network', 'testnet', '--send', 'no', '--', 'next_list_id'])
  );
  const tree = buildClaimTree(
    claimers.map((address) => ({ address, amount: '1' })),
    { network: TESTNET_PASSPHRASE, token, list: listId }
  );
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + windowS;
  const list = {
    root: { bytes: tree.merkleRoot },
    tree_uri: `ipfs://${rawCid(claimTreeJson(tree))}`,
    price: { i128: price.toString() },
    expires_at: { u64: String(now + 7 * 86_400) },
    total: Number(tree.tokenTotal),
    threshold_claimers: claimers.length + 1,
    deadline: { u64: String(deadline) }
  };
  const opened = stellarJson([
    'contract',
    'invoke',
    '--id',
    manager.manager,
    '--source-account',
    founder,
    '--network',
    'testnet',
    '--',
    'open_assurance',
    '--token_address',
    token,
    '--list',
    JSON.stringify(list),
    '--launch_config',
    JSON.stringify({ launch_auction: false, launch_marketplace: false })
  ]);
  if (Number(opened) !== listId) throw new Error(`open_assurance opened list ${String(opened)}, expected ${listId}`);
  const proofs = Object.fromEntries(
    Object.entries(tree.claims).map(([address, entry]) => [address, { amount: entry.amount, proof: entry.proof }])
  );
  return { daoId: token, claims, listId, deadline, price, proofs };
}
