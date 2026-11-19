import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { timelineKeyName } from './identities.ts';
import { E2E_MANAGER_ARTIFACT, REPO_ROOT } from './preflight.ts';

/**
 * W16 (contract upgrades) fixture and chain reads. The candidate is a throwaway Metadata build
 * (docs/qa/WALKTHROUGHS.md, "W16"): same code as the dev Manager's Metadata 0.4.0, plus a cargo
 * feature that sets the storage version to 2 (no data rewrite) and a contract-meta marker.
 */
export const W16 = {
  slug: 'e2e-w16',
  artifact: 'deploys/dev-testnet-dao-16.json',
  module: 'metadata',
  implementationName: 'Metadata',
  from: { version: '0.4.0', hash: 'a378c2282e883327a3a919e70280033cc87e0279b6be5c924ccbd035a57370da', storage: 1 },
  to: { version: '0.4.1', hash: 'd243d7922b1a7e4d26c9e835b39175689978edc9df6fd484503dccb1b4d78e29', storage: 2 }
} as const;

type DaoArtifact = { addresses: Record<string, string | null>; manager: string };

export function w16Addresses() {
  const dao = JSON.parse(readFileSync(resolve(REPO_ROOT, W16.artifact), 'utf8')) as DaoArtifact;
  const manager = (JSON.parse(readFileSync(E2E_MANAGER_ARTIFACT, 'utf8')) as { manager: string }).manager;
  if (dao.manager !== manager) throw new Error(`${W16.artifact} was made on ${dao.manager}, not ${manager}`);
  const need = (name: string) => {
    const value = dao.addresses[name];
    if (!value) throw new Error(`${W16.artifact} has no ${name} address`);
    return value;
  };
  return { manager, token: need('token'), metadata: need('metadata'), governor: need('governor') };
}

/** A read-only `stellar contract invoke --send no`, from the timeline's operator key. Returns parsed JSON. */
export function view(contract: string, fn: string, args: Record<string, string> = {}): unknown {
  const out = execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      contract,
      '--network',
      'testnet',
      '--source-account',
      timelineKeyName('e2e-operator'),
      '--send',
      'no',
      '--',
      fn,
      ...Object.entries(args).flatMap(([name, value]) => [`--${name}`, value])
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, STELLAR_NO_CACHE: 'true' } }
  ).trim();
  return out === '' ? null : JSON.parse(out);
}

export type RegistryState = {
  /** `get_implementation(to)`, null until the admin registers it. */
  target: { name: string; version: string; revoked: boolean } | null;
  approved: boolean;
  latest: string | null;
};

export type ModuleState = { version: string; hash: string; storageVersion: number };

export function readRegistry(manager: string): RegistryState {
  const target = view(manager, 'get_implementation', { wasm_hash: W16.to.hash }) as RegistryState['target'];
  const approved = view(manager, 'is_upgrade_approved', { from_hash: W16.from.hash, to_hash: W16.to.hash }) === true;
  const latest = (view(manager, 'latest_pointer', { name: W16.implementationName }) as { wasm_hash: string } | null)
    ?.wasm_hash;
  return { target, approved, latest: latest ?? null };
}

export function readModule(metadata: string): ModuleState {
  return {
    version: view(metadata, 'version') as string,
    hash: view(metadata, 'wasm_hash') as string,
    storageVersion: Number(view(metadata, 'storage_version'))
  };
}

export type W16Phase =
  /** The admin steps haven't all run: nothing to see in the app yet. */
  | { phase: 'awaiting-admin'; missing: string[] }
  /** Registered, approved and announced: the app offers the upgrade. */
  | { phase: 'available' }
  /** The tribe runs the candidate but hasn't migrated (a proposal that ran upgrade without migrate). */
  | { phase: 'upgraded-not-migrated' }
  /** The walkthrough's proposal has run. */
  | { phase: 'done' };

/** Where the fixture stands, from the registry and the module. Pure, so it is unit-tested. */
export function w16Phase(registry: RegistryState, module: ModuleState): W16Phase {
  if (module.hash === W16.to.hash)
    return module.storageVersion >= W16.to.storage ? { phase: 'done' } : { phase: 'upgraded-not-migrated' };
  if (module.hash !== W16.from.hash)
    throw new Error(`The W16 Metadata runs ${module.hash}, neither ${W16.from.hash} nor the candidate`);
  const missing: string[] = [];
  if (!registry.target) missing.push(`1. register_implementation Metadata ${W16.to.version}`);
  else if (registry.target.name !== W16.implementationName || registry.target.version !== W16.to.version)
    throw new Error(`The candidate is registered as ${registry.target.name} ${registry.target.version}`);
  else if (registry.target.revoked) throw new Error('The candidate was revoked; W16 needs a new candidate build');
  if (!registry.approved) missing.push(`2. approve_upgrade ${W16.from.version} -> ${W16.to.version}`);
  if (registry.latest !== W16.to.hash) missing.push(`3. set_latest_implementation Metadata ${W16.to.version}`);
  return missing.length ? { phase: 'awaiting-admin', missing } : { phase: 'available' };
}

export type ProposalInfo = { id: string; vote_start: number; vote_end: number; eta: number; state: unknown };

/** The governor's newest proposal (the one this run just submitted). */
export function latestProposal(governor: string): ProposalInfo {
  const count = Number(view(governor, 'proposal_count'));
  if (!count) throw new Error('The W16 Governor has no proposals');
  const [id] = view(governor, 'proposal_ids', { start: String(count - 1), limit: '1' }) as string[];
  return proposal(governor, id);
}

export function proposal(governor: string, id: string): ProposalInfo {
  const info = view(governor, 'proposal', { proposal_id: id }) as Record<string, unknown>;
  return {
    id,
    vote_start: Number(info.vote_start),
    vote_end: Number(info.vote_end),
    eta: Number(info.eta),
    state: info.state
  };
}
