import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { HORIZON_TESTNET, REPO_ROOT } from './preflight.ts';

/**
 * The W10 fixture tribe, "E2E Market" (docs/qa/WALKTHROUGHS.md, "The W10 market fixture"): a
 * marketplace-only tribe on the Manager the run indexes, priced in native XLM with a 2.5% resale
 * fee. e2e-founder holds tokens 0-2, e2e-member-a (the seller) 3 and 4; e2e-member-b buys.
 * `E2E_MARKET_DAO_ARTIFACT` points at another deploy artifact (one per Manager).
 */
const CONFIG = 'configs/e2e-walk-market-dao.json';
const ARTIFACT = process.env.E2E_MARKET_DAO_ARTIFACT?.trim() || 'deploys/dev-testnet-dao-1.json';

type DaoArtifact = {
  network: string;
  addresses: { token: string; marketplace: string | null; treasury: string };
  config: { slug: string; marketplace: { paymentAsset: string; secondaryFeeBps: number } };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T;
}

export function loadMarketFixture() {
  const artifact = readJson<DaoArtifact>(ARTIFACT);
  const config = readJson<{ slug: string }>(CONFIG);
  if (artifact.network !== 'testnet') throw new Error(`${ARTIFACT} is for ${artifact.network}, not testnet`);
  if (!artifact.addresses.marketplace) throw new Error(`${ARTIFACT} has no marketplace`);
  if (artifact.config.slug !== config.slug) throw new Error(`${ARTIFACT} was not deployed from ${CONFIG}`);
  return {
    slug: artifact.config.slug,
    /** The tribe id is its token contract. */
    daoId: artifact.addresses.token,
    marketplace: artifact.addresses.marketplace,
    treasury: artifact.addresses.treasury,
    paymentAsset: artifact.config.marketplace.paymentAsset,
    feeBps: artifact.config.marketplace.secondaryFeeBps,
    /** The seller's two tokens. */
    sellerTokens: [3, 4]
  };
}
export type MarketFixture = ReturnType<typeof loadMarketFixture>;

/* ---------- Direct contract calls, for resetting the fixture only (never the flow under test) ---------- */

function invoke(contract: string, source: string, args: string[], send: 'yes' | 'no') {
  const out = execFileSync(
    'stellar',
    [
      'contract',
      'invoke',
      '--id',
      contract,
      '--source-account',
      source,
      '--network',
      'testnet',
      '--send',
      send,
      '--',
      ...args
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  return out ? (JSON.parse(out) as unknown) : null;
}

export function ownerOf(fixture: MarketFixture, tokenId: number) {
  return invoke(fixture.daoId, 'e2e-operator', ['owner_of', '--token_id', String(tokenId)], 'no') as string;
}

export function listingOf(fixture: MarketFixture, tokenId: number) {
  return invoke(fixture.marketplace, 'e2e-operator', ['get_listing', '--token_id', String(tokenId)], 'no') as {
    seller: string;
    price: string;
    expires_at: number;
  } | null;
}

/**
 * Put the seller's tokens back with the seller, so W10 can run again: a listing left by an earlier
 * run is cancelled by its seller, and a token the buyer bought is sent back. Signed with the
 * `stellar keys` identities; returns what it changed.
 */
export function resetMarketFixture(fixture: MarketFixture, ids: Record<string, string>) {
  const changed: string[] = [];
  for (const tokenId of fixture.sellerTokens) {
    // Testnet RPC sometimes simulates against a ledger just before the previous reset call landed,
    // so the footprint misses a key that call created ("outside of the footprint"). Each attempt
    // reads the state again and re-simulates.
    for (let attempt = 1; ; attempt++) {
      try {
        changed.push(...resetToken(fixture, ids, tokenId));
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
  }
  return changed;
}

function resetToken(fixture: MarketFixture, ids: Record<string, string>, tokenId: number) {
  const changed: string[] = [];
  const nameOf = (address: string) => Object.entries(ids).find(([, value]) => value === address)?.[0];
  let owner = ownerOf(fixture, tokenId);
  if (owner === fixture.marketplace) {
    const listing = listingOf(fixture, tokenId);
    const seller = listing ? nameOf(listing.seller) : undefined;
    if (!listing || !seller) throw new Error(`Token #${tokenId} is held by the market for an unknown seller`);
    invoke(fixture.marketplace, seller, ['cancel', '--token_id', String(tokenId), '--seller', listing.seller], 'yes');
    changed.push(`cancelled the listing of #${tokenId} (${seller})`);
    owner = listing.seller;
  }
  if (owner !== ids['e2e-member-a']) {
    const holder = nameOf(owner);
    if (!holder) throw new Error(`Token #${tokenId} is held by ${owner}, not a walkthrough identity`);
    invoke(
      fixture.daoId,
      holder,
      ['transfer', '--from', owner, '--to', ids['e2e-member-a']!, '--token_id', String(tokenId)],
      'yes'
    );
    changed.push(`sent #${tokenId} back from ${holder}`);
  }
  return changed;
}

/** An account's native XLM balance in stroops, from Horizon. */
export async function nativeStroops(address: string): Promise<bigint> {
  const response = await fetch(`${HORIZON_TESTNET}/accounts/${address}`);
  if (!response.ok) throw new Error(`Horizon ${response.status} reading ${address}`);
  const account = (await response.json()) as { balances: { asset_type: string; balance: string }[] };
  const balance = account.balances.find((entry) => entry.asset_type === 'native')?.balance ?? '0';
  const [whole, fraction = ''] = balance.split('.');
  return BigInt(whole!) * 10_000_000n + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}

/** XLM (7 decimals) as stroops: "6" → 60000000n. */
export function xlmStroops(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 10_000_000n + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}
