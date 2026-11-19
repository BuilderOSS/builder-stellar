import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Asset, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

import { E2E_IDENTITIES, E2E_WEB_AUTH_IDENTITY, type Identity, loadIdentity } from './identities.ts';
import { FRIENDBOT_URL, TESTNET_PASSPHRASE } from './network.ts';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

/** The separate e2e Manager (decision E1). Written by deploy-manager.mjs from configs/testnet-e2e-manager.json. */
export const E2E_MANAGER_ARTIFACT = resolve(
  REPO_ROOT,
  process.env.E2E_MANAGER_ARTIFACT?.trim() || 'deploys/e2e-walk-testnet-manager.json'
);

/** Identities the preflight funds: the four wallets and the app server's SEP-53/SEP-10 signing key. */
export const FUNDED_IDENTITIES = [...E2E_IDENTITIES, E2E_WEB_AUTH_IDENTITY];

/** Top up when an identity falls below this many XLM (a tribe deploy costs well under 100). */
export const MIN_BALANCE_XLM = 1_000;

type Log = (line: string) => void;

// ---------------------------------------------------------------- funding

export type FundingDeps = {
  balance: (address: string) => Promise<number | null>;
  friendbot: (address: string) => Promise<void>;
  /** Friendbot only creates accounts; a top-up funds a throwaway account and merges it in. */
  mergeInto: (target: string, source: Keypair) => Promise<void>;
};

export const liveFunding: FundingDeps = {
  balance: async (address) => {
    const response = await fetch(`${HORIZON_TESTNET}/accounts/${address}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Horizon ${response.status} reading ${address}`);
    const account = (await response.json()) as { balances: { asset_type: string; balance: string }[] };
    return Number(account.balances.find((entry) => entry.asset_type === 'native')?.balance ?? 0);
  },
  friendbot: async (address) => {
    const response = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
    if (!response.ok) throw new Error(`Friendbot ${response.status} funding ${address}`);
  },
  mergeInto: async (target, source) => {
    const horizon = new Horizon.Server(HORIZON_TESTNET);
    const account = await horizon.loadAccount(source.publicKey());
    const tx = new TransactionBuilder(account, { fee: '1000', networkPassphrase: TESTNET_PASSPHRASE })
      .addOperation(Operation.accountMerge({ destination: target }))
      .setTimeout(60)
      .build();
    tx.sign(source);
    await horizon.submitTransaction(tx);
  }
};

export type FundingResult = {
  name: string;
  address: string;
  action: 'created' | 'topped-up' | 'ok';
  balanceXlm: number | null;
};

/** Fund or top up each identity. Logs names and public addresses only. */
export async function fundIdentities(
  identities: Identity[],
  {
    deps = liveFunding,
    log = console.info,
    minXlm = MIN_BALANCE_XLM
  }: { deps?: FundingDeps; log?: Log; minXlm?: number } = {}
): Promise<FundingResult[]> {
  const results: FundingResult[] = [];
  for (const { name, address } of identities) {
    const before = await deps.balance(address);
    let action: FundingResult['action'] = 'ok';
    if (before === null) {
      await deps.friendbot(address);
      action = 'created';
    } else if (before < minXlm) {
      const donor = Keypair.random();
      await deps.friendbot(donor.publicKey());
      await deps.mergeInto(address, donor);
      action = 'topped-up';
    }
    const balanceXlm = action === 'ok' ? before : await deps.balance(address);
    log(`  ${name.padEnd(14)} ${address}  ${action}${balanceXlm === null ? '' : `, ${Math.floor(balanceXlm)} XLM`}`);
    results.push({ name, address, action, balanceXlm });
  }
  return results;
}

// ---------------------------------------------------------------- contract hashes

/** Manager artifact keys → `target/wasm32v1-none/release/<file>.wasm`, and the current_implementations field. */
export const CONTRACTS = [
  { name: 'manager', field: null },
  { name: 'token', field: 'token' },
  { name: 'metadata', field: 'metadata' },
  { name: 'auction', field: 'auction' },
  { name: 'governor', field: 'governor' },
  { name: 'treasury', field: 'treasury' },
  { name: 'marketplace', field: 'marketplace' },
  { name: 'minter', field: 'claims' }
] as const;

export type HashMismatch = { contract: string; onChain: string | null; built: string };

/** Pure comparison: every on-chain hash must equal the local build's. */
export function compareHashes(onChain: Record<string, string | null>, built: Record<string, string>): HashMismatch[] {
  return CONTRACTS.filter(({ name }) => onChain[name] !== built[name]).map(({ name }) => ({
    contract: name,
    onChain: onChain[name] ?? null,
    built: built[name]
  }));
}

export function builtHashes(root = REPO_ROOT): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const { name } of CONTRACTS) {
    const path = join(root, 'target/wasm32v1-none/release', `${name}.wasm`);
    if (!existsSync(path)) throw new Error(`${path} is missing; run stellar contract build`);
    hashes[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return hashes;
}

function invokeView(managerId: string, method: string, source: string): unknown {
  const out = execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      managerId,
      '--source-account',
      source,
      '--network',
      'testnet',
      '--send',
      'no',
      '--',
      method
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  return JSON.parse(out);
}

/** The Manager's own hash (`wasm_hash`) and the module hashes new tribes get (`current_implementations`). */
export function onChainHashes(managerId: string, source = 'e2e-operator'): Record<string, string | null> {
  const current = invokeView(managerId, 'current_implementations', source) as Record<string, string> | null;
  const hashes: Record<string, string | null> = { manager: invokeView(managerId, 'wasm_hash', source) as string };
  for (const { name, field } of CONTRACTS) if (field) hashes[name] = current?.[field] ?? null;
  return hashes;
}

export type ManagerCheck =
  | { status: 'verified'; manager: string }
  | { status: 'no-manager'; artifact: string }
  | { status: 'mismatch'; manager: string; mismatches: HashMismatch[] };

/**
 * Compare the e2e Manager on testnet with `stellar contract build` output (§13.1): a walkthrough
 * against older contracts tests the wrong code. `build: false` reuses the current target/ output.
 */
export function checkManager({ build = true, log = console.info }: { build?: boolean; log?: Log } = {}): ManagerCheck {
  if (!existsSync(E2E_MANAGER_ARTIFACT)) return { status: 'no-manager', artifact: E2E_MANAGER_ARTIFACT };
  const artifact = JSON.parse(readFileSync(E2E_MANAGER_ARTIFACT, 'utf8')) as { manager: string; network: string };
  if (artifact.network !== 'testnet')
    throw new Error(`${E2E_MANAGER_ARTIFACT} is for ${artifact.network}, not testnet`);
  if (build) {
    log('  stellar contract build ...');
    execFileSync('stellar', ['contract', 'build'], { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  const mismatches = compareHashes(onChainHashes(artifact.manager), builtHashes());
  return mismatches.length
    ? { status: 'mismatch', manager: artifact.manager, mismatches }
    : { status: 'verified', manager: artifact.manager };
}

export function describeMismatch(check: Extract<ManagerCheck, { status: 'mismatch' }>) {
  const rows = check.mismatches.map(
    (m) => `  ${m.contract.padEnd(12)} on chain ${m.onChain ?? '(unset)'}\n${''.padEnd(15)}built    ${m.built}`
  );
  return (
    `The e2e Manager ${check.manager} does not run this checkout's contracts:\n${rows.join('\n')}\n` +
    'Upgrade it (docs/qa/WALKTHROUGHS.md, "Upgrade the e2e Manager to dev") or redeploy, then run again.'
  );
}

// ---------------------------------------------------------------- run

export type PreflightResult = { funded: FundingResult[]; manager: ManagerCheck };

export async function preflight({
  build = true,
  requireManager = false,
  log = console.info
}: { build?: boolean; requireManager?: boolean; log?: Log } = {}): Promise<PreflightResult> {
  log('Preflight: funding identities (public addresses only)');
  const identities = FUNDED_IDENTITIES.map((name) => loadIdentity(name, undefined, { create: true }));
  const funded = await fundIdentities(identities, { log });

  log('Preflight: e2e Manager contracts');
  const manager = checkManager({ build, log });
  if (manager.status === 'mismatch') throw new Error(describeMismatch(manager));
  if (manager.status === 'no-manager') {
    const message = `No e2e Manager artifact at ${manager.artifact} (docs/qa/WALKTHROUGHS.md, "Deploy the e2e Manager").`;
    if (requireManager) throw new Error(message);
    log(`  ${message} Chain flows will refuse to run; auth and read-only flows go ahead.`);
  } else {
    log(`  ${manager.manager}: every hash matches the local build`);
  }
  return { funded, manager };
}
