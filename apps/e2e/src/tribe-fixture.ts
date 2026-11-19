import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { timelineKeyName } from './identities.ts';
import { HORIZON_TESTNET, REPO_ROOT } from './preflight.ts';

/**
 * Fixture tribes a walkthrough runs on (docs/qa/WALKTHROUGHS.md, "Fixture tribes"): created once with
 * scripts/deploy-dao.mjs from `configs/e2e-walk-<slug>-dao.json`, their addresses read from the
 * committed deploy artifact `deploys/dev-testnet-dao-<nonce>.json`.
 */
type DaoArtifact = {
  network: string;
  status: string;
  addresses: {
    token: string;
    treasury: string;
    governor: string;
    auction: string | null;
    marketplace: string | null;
    claims: string | null;
  };
  config: { slug: string; nonce: number; token: { name: string } };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T;
}

export function loadTribe(slug: string, artifactPath: string) {
  const artifact = readJson<DaoArtifact>(artifactPath);
  const config = readJson<{ slug: string; nonce: number }>(`configs/e2e-walk-${slug}-dao.json`);
  if (artifact.network !== 'testnet') throw new Error(`${artifactPath} is for ${artifact.network}, not testnet`);
  if (artifact.config.slug !== config.slug || artifact.config.nonce !== config.nonce)
    throw new Error(`${artifactPath} was not deployed from configs/e2e-walk-${slug}-dao.json`);
  return {
    slug: artifact.config.slug,
    status: artifact.status,
    /** The tribe id is its token contract. */
    daoId: artifact.addresses.token,
    tokenName: artifact.config.token.name,
    addresses: artifact.addresses
  };
}

export type Tribe = ReturnType<typeof loadTribe>;

/** 1 XLM in stroops (the native SAC has 7 decimals). */
export const XLM = 10_000_000n;

/** An account's native balance in stroops, from Horizon. */
export async function nativeStroops(address: string): Promise<bigint> {
  const response = await fetch(`${HORIZON_TESTNET}/accounts/${address}`);
  if (!response.ok) throw new Error(`Horizon ${response.status} reading ${address}`);
  const account = (await response.json()) as { balances: { asset_type: string; balance: string }[] };
  const balance = account.balances.find((entry) => entry.asset_type === 'native')?.balance ?? '0';
  const [whole, fraction = ''] = balance.split('.');
  return BigInt(whole) * XLM + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}

/** A contract's balance of a Stellar Asset Contract (e.g. the Treasury's XLM), read through a simulation. */
export function sacBalance(asset: string, holder: string, source = timelineKeyName('e2e-operator')): bigint {
  const out = execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      asset,
      '--source-account',
      source,
      '--network',
      'testnet',
      '--send',
      'no',
      '--',
      'balance',
      '--id',
      holder
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  return BigInt(JSON.parse(out) as string);
}
