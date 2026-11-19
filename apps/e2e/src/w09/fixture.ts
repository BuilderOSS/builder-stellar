import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { APIRequestContext } from '@playwright/test';

import { timelineKeyName } from '../identities.ts';
import { REPO_ROOT } from '../preflight.ts';

/**
 * The W09 and W15 fixture tribes (docs/qa/WALKTHROUGHS.md, "The W09 and W15 fixtures"), all on the
 * dev Manager and made by e2e-w09-founder with scripts/deploy-dao.mjs:
 *
 *   e2e-w09    "E2E Actions"  launched; auction and market in XLM; no claims module. W09's tribe.
 *   e2e-w09-2  "E2E Manage"   launched; the same shape. W15 changes its settings from Manage.
 *   e2e-w09-3  "E2E Setup"    created and set up, never launched: Manage shows the Setup copy.
 *
 * e2e-founder holds 6 of the 8 founder votes, so it passes a proposal alone at 10% quorum. Routes use
 * the tribe id (its token contract), never the slug: W09 changes the slug on every run.
 */
export const NATIVE_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
export const USDC_SAC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

type DaoArtifact = {
  network: string;
  status: string;
  addresses: {
    token: string;
    treasury: string;
    governor: string;
    metadata: string;
    auction: string | null;
    marketplace: string | null;
    claims: string | null;
  };
  config: { slug: string; nonce: number; token: { name: string; symbol: string } };
};

const FIXTURES = {
  actions: { config: 'configs/e2e-walk-w09-dao.json', artifact: 'deploys/dev-testnet-dao-9.json' },
  manage: { config: 'configs/e2e-walk-w09-2-dao.json', artifact: 'deploys/dev-testnet-dao-901.json' },
  setup: { config: 'configs/e2e-walk-w09-3-dao.json', artifact: 'deploys/dev-testnet-dao-902.json' }
} as const;
export type FixtureName = keyof typeof FIXTURES;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T;
}

export function loadTribe(name: FixtureName) {
  const { config: configPath, artifact: artifactPath } = FIXTURES[name];
  const artifact = readJson<DaoArtifact>(artifactPath);
  const config = readJson<{ slug: string; nonce: number }>(configPath);
  if (artifact.network !== 'testnet') throw new Error(`${artifactPath} is for ${artifact.network}, not testnet`);
  if (artifact.config.nonce !== config.nonce) throw new Error(`${artifactPath} was not deployed from ${configPath}`);
  const { addresses } = artifact;
  return {
    name,
    /** The slug it launched with. W09 changes it, so pages are opened by id. */
    launchSlug: artifact.config.slug,
    launched: artifact.status === 'operational',
    daoId: addresses.token,
    token: addresses.token,
    treasury: addresses.treasury,
    governor: addresses.governor,
    metadata: addresses.metadata,
    auction: addresses.auction,
    marketplace: addresses.marketplace,
    /** A path inside the tribe, by id. */
    path: (section = '') => `/dao/${addresses.token}${section ? `/${section}` : ''}`,
    api: (section = '') => `/api/dao/${addresses.token}${section ? `/${section}` : ''}`
  };
}
export type Tribe = ReturnType<typeof loadTribe>;

/* ---------- Direct contract calls: reads for checks, and fixture upkeep (never the flow under test) ---------- */

/** `stellar contract invoke`, signed (or simulated) by a role's timeline key. Prints nothing secret. */
export function invoke(contract: string, role: string, args: string[], send: 'yes' | 'no' = 'no'): unknown {
  for (let attempt = 1; ; attempt++) {
    try {
      const out = execFileSync(
        'stellar',
        [
          'contract',
          'invoke',
          '--id',
          contract,
          '--source-account',
          timelineKeyName(role),
          '--network',
          'testnet',
          `--send=${send}`,
          '--',
          ...args
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      ).trim();
      return out ? (JSON.parse(out) as unknown) : null;
    } catch (error) {
      // Testnet RPC sometimes simulates against a ledger just before the last write landed.
      if (attempt >= 3) throw error;
    }
  }
}

/** A read, simulated from the operator's account. */
export const read = <T>(contract: string, ...args: string[]) => invoke(contract, 'e2e-operator', args, 'no') as T;

export type TokenSettings = { dao_recovery: boolean; members_only_delegation: boolean; transfers_locked: boolean };
export type AuctionConfig = {
  duration: number;
  min_bid_increment_percent: number;
  payment_token: string;
  reserve_price: string;
  time_buffer: number;
};
export type MarketConfig = { default_secondary_fee_bps: number; paused: boolean; payment_asset: string };
export type AuctionNow = { token_id: string; settled: boolean; highest_bid: string; end_time: number };
export type GovernorRules = {
  votingDelay: number;
  votingPeriod: number;
  queueDelay: number;
  threshold: number;
  quorumBps: number;
};

/**
 * The voting rules from the Governor, except the safety delay: the Governor has no getter for it, so
 * it comes from the indexed settings (`/governance/settings`, fed by its update event).
 */
export async function governorRules(request: APIRequestContext, tribe: Tribe): Promise<GovernorRules> {
  const response = await request.get(tribe.api('governance/settings'));
  if (!response.ok()) throw new Error(`governance settings: HTTP ${response.status()}`);
  const { settings } = (await response.json()) as { settings: { queueDelay: number } };
  return {
    votingDelay: Number(read(tribe.governor, 'voting_delay')),
    votingPeriod: Number(read(tribe.governor, 'voting_period')),
    queueDelay: Number(settings.queueDelay),
    threshold: Number(read(tribe.governor, 'proposal_threshold')),
    quorumBps: Number(read(tribe.governor, 'quorum_bps'))
  };
}

export const ownerOf = (tribe: Tribe, tokenId: number) =>
  read<string>(tribe.token, 'owner_of', '--token_id', String(tokenId));
export const tokenSettings = (tribe: Tribe) => read<TokenSettings>(tribe.token, 'settings');
export const transferAgents = (tribe: Tribe) => read<string[]>(tribe.token, 'transfer_agents');
export const tokenModules = (tribe: Tribe) =>
  read<{ address: string; kind: string; non_voting: boolean }[]>(tribe.token, 'modules');
export const mintAllowance = (tribe: Tribe, module: string) =>
  Number(read<string | number>(tribe.token, 'mint_allowance', '--module', module));
export const tokenName = (tribe: Tribe) => ({
  name: read<string>(tribe.token, 'name'),
  symbol: read<string>(tribe.token, 'symbol')
});
export const auctionConfig = (tribe: Tribe) => read<AuctionConfig>(tribe.auction!, 'get_config');
export const auctionNow = (tribe: Tribe) => read<AuctionNow>(tribe.auction!, 'get_auction');
export const auctionPaused = (tribe: Tribe) => read<boolean>(tribe.auction!, 'paused');
export const marketConfig = (tribe: Tribe) => read<MarketConfig>(tribe.marketplace!, 'get_config');
export const rendererBase = (tribe: Tribe) => read<string>(tribe.metadata, 'renderer_base');
/** A SAC balance (stroops for XLM). */
export const sacBalance = (asset: string, holder: string) => BigInt(read<string>(asset, 'balance', '--id', holder));

/* ---------- The app's own API (the read model) ---------- */

export type TokenRow = { tokenId: number; owner: string };

/** Token ids an owner holds, from the indexer, smallest first. */
export async function tokensOf(request: APIRequestContext, tribe: Tribe, owner: string): Promise<number[]> {
  const response = await request.get(`${tribe.api('tokens')}?owner=${owner}&limit=100`);
  if (!response.ok()) throw new Error(`tokens of ${owner}: HTTP ${response.status()}`);
  const body = (await response.json()) as { items: TokenRow[] };
  return body.items
    .filter((row) => row.owner === owner)
    .map((row) => Number(row.tokenId))
    .sort((a, b) => a - b);
}

/** The first of `candidates` the chain says `owner` still holds (the indexer can lag a transfer). */
export function firstHeld(tribe: Tribe, owner: string, candidates: number[], skip: number[] = []) {
  for (const id of candidates) if (!skip.includes(id) && ownerOf(tribe, id) === owner) return id;
  throw new Error(`${owner} holds none of tokens ${candidates.join(', ')} on chain`);
}

/** A ledger far enough ahead for an approval to outlive a proposal (about 1 day). */
export function approvalLedger() {
  const out = execFileSync('stellar', ['ledger', 'latest', '--network', 'testnet', '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return Number((JSON.parse(out) as { sequence: number }).sequence) + 17_280;
}
