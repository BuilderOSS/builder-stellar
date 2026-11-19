import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { APIRequestContext } from '@playwright/test';

import { REPO_ROOT } from './preflight.ts';
import { waitForIndexed } from './waits.ts';

/**
 * The W02 fixture tribe, "E2E Discover" (docs/qa/WALKTHROUGHS.md, "The W02 fixture"): a
 * governance-only tribe on the dev Manager, with no auction or marketplace. e2e-founder (of the w02
 * timeline) holds tokens 0 and 1, e2e-member-a token 2. W02 finds and opens it, W13 funds its
 * treasury and proposes a payout, W17 renews its storage. `E2E_W02_DAO_ARTIFACT` points at another
 * deploy artifact (one per Manager).
 */
const CONFIG = 'configs/e2e-walk-w02-dao.json';
const ARTIFACT = process.env.E2E_W02_DAO_ARTIFACT?.trim() || 'deploys/dev-testnet-dao-2.json';

type DaoArtifact = {
  network: string;
  status: string;
  manager: string;
  addresses: { token: string; treasury: string; governor: string; metadata: string };
  config: {
    slug: string;
    founders: { address: string; amount: number }[];
    token: { name: string; symbol: string };
    metadata: { profile: { description: string } };
  };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T;
}

export function loadW02Fixture() {
  const artifact = readJson<DaoArtifact>(ARTIFACT);
  const config = readJson<{ slug: string }>(CONFIG);
  if (artifact.network !== 'testnet') throw new Error(`${ARTIFACT} is for ${artifact.network}, not testnet`);
  if (artifact.status !== 'operational') throw new Error(`${ARTIFACT} is not launched (${artifact.status})`);
  if (artifact.config.slug !== config.slug) throw new Error(`${ARTIFACT} was not deployed from ${CONFIG}`);
  return {
    slug: artifact.config.slug,
    /** The tribe id is its token contract. */
    daoId: artifact.addresses.token,
    treasury: artifact.addresses.treasury,
    governor: artifact.addresses.governor,
    /** The dev Manager: a real contract that no tribe owns. */
    manager: artifact.manager,
    /** The founder (the w02 timeline's e2e-founder), a wallet address. */
    founder: artifact.config.founders[0]!.address,
    name: artifact.config.token.name,
    symbol: artifact.config.token.symbol,
    description: artifact.config.metadata.profile.description
  };
}
export type W02Fixture = ReturnType<typeof loadW02Fixture>;

/**
 * "E2E Market", W10's fixture (launched on dev by another timeline). W02 only reads it: it is found
 * by name and symbol and opened by its slug. Never sign against it.
 */
export const MARKET_TRIBE = { slug: 'e2e-market', name: 'E2E Market', symbol: 'E2EM' } as const;

type SlugBody = { slug: string; valid: boolean; claimedBy: string | null };

/** The tribe id a slug resolves to, once the read model shows the slug claimed. */
export async function claimedSlug(request: APIRequestContext, slug: string) {
  const body = await waitForIndexed<SlugBody>(
    request,
    {
      label: `slug ${slug} claimed in the read model`,
      path: `/api/slugs/${slug}`,
      predicate: (b) => Boolean(b.claimedBy)
    },
    { governingS: 0, slackS: 60 }
  );
  return body.claimedBy as string;
}
