import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { timelineKeyName } from '../identities.ts';
import { HORIZON_TESTNET, REPO_ROOT } from '../preflight.ts';

/**
 * The W11 and W14 fixture tribes (docs/qa/WALKTHROUGHS.md, "The W11 and W14 fixtures"), all on the
 * dev Manager and launched by the w11 timeline's founder:
 *
 *   - "E2E Pools" (e2e-w11): a marketplace in native XLM with a 2.5% resale fee and a funded
 *     treasury. e2e-founder holds tokens 0-9 and passes proposals alone; e2e-member-a holds 10-19
 *     and lists one of them per run for the Treasury purchase; e2e-member-b holds none.
 *   - "E2E Members" (e2e-w11-2): every membership switch off. e2e-founder holds 0-1,
 *     e2e-member-a 2-3, e2e-member-b 4.
 *   - "E2E Members Only" (e2e-w11-3): members-only delegation on. e2e-founder holds 0-1,
 *     e2e-member-a 2; e2e-member-b holds none, so it isn't a member.
 *
 * Role names (e2e-founder, ...) map to the timeline's stellar keys (e2e-w11-founder, ...) through
 * timelineKeyName, like the wallet does.
 */

type DaoArtifact = {
  network: string;
  addresses: { token: string; treasury: string; governor: string; marketplace: string | null };
  config: { slug: string; token: { name: string }; marketplace?: { paymentAsset: string; secondaryFeeBps: number } };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T;
}

function loadTribe(configPath: string, artifactPath: string) {
  const artifact = readJson<DaoArtifact>(artifactPath);
  const config = readJson<{ slug: string }>(configPath);
  if (artifact.network !== 'testnet') throw new Error(`${artifactPath} is for ${artifact.network}, not testnet`);
  if (artifact.config.slug !== config.slug) throw new Error(`${artifactPath} was not deployed from ${configPath}`);
  return {
    slug: artifact.config.slug,
    name: artifact.config.token.name,
    /** The tribe id is its token contract. */
    daoId: artifact.addresses.token,
    treasury: artifact.addresses.treasury,
    governor: artifact.addresses.governor,
    marketplace: artifact.addresses.marketplace,
    paymentAsset: artifact.config.marketplace?.paymentAsset ?? null,
    feeBps: artifact.config.marketplace?.secondaryFeeBps ?? 0
  };
}
export type Tribe = ReturnType<typeof loadTribe>;

export const POOLS_TRIBE = loadTribe(
  'configs/e2e-walk-e2e-w11-dao.json',
  process.env.E2E_W11_POOLS_ARTIFACT?.trim() || 'deploys/dev-testnet-dao-11.json'
);
export const MEMBERS_TRIBE = loadTribe(
  'configs/e2e-walk-e2e-w11-2-dao.json',
  process.env.E2E_W11_MEMBERS_ARTIFACT?.trim() || 'deploys/dev-testnet-dao-1101.json'
);
export const MEMBERS_ONLY_TRIBE = loadTribe(
  'configs/e2e-walk-e2e-w11-3-dao.json',
  process.env.E2E_W11_MEMBERS_ONLY_ARTIFACT?.trim() || 'deploys/dev-testnet-dao-1102.json'
);

/** Who holds what at rest (see above). */
export const TOKENS = {
  pools: { founder: range(0, 10), memberA: range(10, 20) },
  members: { founder: [0, 1], memberA: [2, 3], memberB: [4] },
  membersOnly: { founder: [0, 1], memberA: [2] }
} as const;

function range(from: number, to: number) {
  return Array.from({ length: to - from }, (_, index) => from + index);
}

/* ---------- Direct contract calls: fixture setup and reset, and reads to check a step (never the step itself) ---------- */

export function invoke(contract: string, role: string, args: string[], send: 'yes' | 'no' = 'no') {
  // Testnet RPC sometimes simulates against a ledger just before the previous call landed; retry.
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
          '--send',
          send,
          '--',
          ...args
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      ).trim();
      return out ? (JSON.parse(out) as unknown) : null;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

const read = (contract: string, args: string[]) => invoke(contract, 'e2e-operator', args, 'no');

export function ownerOf(tribe: Tribe, tokenId: number) {
  return read(tribe.daoId, ['owner_of', '--token_id', String(tokenId)]) as string;
}

export function delegateOf(tribe: Tribe, account: string) {
  return read(tribe.daoId, ['get_delegate', '--account', account]) as string | null;
}

export function approvedFor(tribe: Tribe, tokenId: number) {
  return read(tribe.daoId, ['get_approved', '--token_id', String(tokenId)]) as string | null;
}

export function mintAllowance(tribe: Tribe, module: string) {
  return Number(read(tribe.daoId, ['mint_allowance', '--module', module]));
}

type Listing = { seller: string; price: string; expires_at: number };
export function listingOf(tribe: Tribe, tokenId: number) {
  return read(tribe.marketplace!, ['get_listing', '--token_id', String(tokenId)]) as Listing | null;
}

type Pool = { closed: boolean; expires_at: number; size: number; stocked: number; sold: number };
type PoolSlot = { pool_id: number; unstocked: number; pages: number };

/** A contract's (or account's) balance of a SAC, in stroops. */
export function sacBalance(asset: string, id: string) {
  return BigInt(read(asset, ['balance', '--id', id]) as string);
}

/** An account's native XLM balance in stroops, from Horizon. */
export async function nativeStroops(address: string): Promise<bigint> {
  const response = await fetch(`${HORIZON_TESTNET}/accounts/${address}`);
  if (!response.ok) throw new Error(`Horizon ${response.status} reading ${address}`);
  const account = (await response.json()) as { balances: { asset_type: string; balance: string }[] };
  return xlmStroops(account.balances.find((entry) => entry.asset_type === 'native')?.balance ?? '0');
}

/** XLM (7 decimals) as stroops: "6" → 60000000n. */
export function xlmStroops(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 10_000_000n + BigInt(fraction.padEnd(7, '0').slice(0, 7));
}

/** The treasury keeps at least this much XLM for Treasury purchases; the reset tops it up. */
const TREASURY_FLOOR = xlmStroops('10');
const TREASURY_TOP_UP = xlmStroops('30');

/**
 * Put "E2E Pools" back so W11 can run again, and return what changed:
 *   - pools an earlier run left past their closing time are closed and swept (anyone may do both
 *     once a pool has ended), so the market never reaches its eight open pools;
 *   - a listing e2e-member-a left open is cancelled;
 *   - the treasury is topped up with XLM from e2e-founder.
 */
export function resetPoolsTribe(ids: Record<string, string>, nowS = Math.floor(Date.now() / 1000)) {
  const tribe = POOLS_TRIBE;
  const marketplace = tribe.marketplace!;
  const changed: string[] = [];
  for (const slot of (read(marketplace, ['open_pools']) as PoolSlot[]) ?? []) {
    const pool = read(marketplace, ['get_pool', '--pool_id', String(slot.pool_id)]) as Pool | null;
    if (!pool) continue;
    if (!pool.closed && pool.expires_at > nowS) continue;
    if (!pool.closed) {
      invoke(marketplace, 'e2e-operator', ['close_pool', '--pool_id', String(slot.pool_id)], 'yes');
      changed.push(`closed ended pool #${slot.pool_id}`);
    }
    for (let left = 1; left > 0;) {
      left = Number(invoke(marketplace, 'e2e-operator', ['sweep_pool', '--pool_id', String(slot.pool_id)], 'yes'));
      const after = (read(marketplace, ['open_pools']) as PoolSlot[]).find((s) => s.pool_id === slot.pool_id);
      left = after ? after.pages : 0;
    }
    changed.push(`swept pool #${slot.pool_id}`);
  }
  for (const tokenId of TOKENS.pools.memberA) {
    if (ownerOf(tribe, tokenId) !== marketplace) continue;
    const listing = listingOf(tribe, tokenId);
    if (listing?.seller !== ids['e2e-member-a']) continue;
    invoke(marketplace, 'e2e-member-a', ['cancel', '--token_id', String(tokenId), '--seller', listing.seller], 'yes');
    changed.push(`cancelled the listing of #${tokenId}`);
  }
  if (sacBalance(tribe.paymentAsset!, tribe.treasury) < TREASURY_FLOOR) {
    invoke(
      tribe.paymentAsset!,
      'e2e-founder',
      ['transfer', '--from', ids['e2e-founder']!, '--to', tribe.treasury, '--amount', String(TREASURY_TOP_UP)],
      'yes'
    );
    changed.push('topped up the treasury');
  }
  return changed;
}

/** A token e2e-member-a holds on "E2E Pools" (one is listed, and bought by the Treasury, per run). */
export function sellerToken(ids: Record<string, string>) {
  const tokenId = TOKENS.pools.memberA.find((id) => ownerOf(POOLS_TRIBE, id) === ids['e2e-member-a']);
  if (tokenId === undefined)
    throw new Error(
      'e2e-member-a has no token left on E2E Pools: each run sells one to the Treasury. Recreate the fixture (WALKTHROUGHS.md).'
    );
  return tokenId;
}

/**
 * List `tokenId` as e2e-member-a for `price` XLM, ending in `hours`: approve the market for that one
 * token, then list. The Treasury purchase is the flow under test; the listing is its setup, and the
 * member sell flow has its own walkthrough (W10).
 */
export async function listAsSeller(ids: Record<string, string>, tokenId: number, price: string, hours = 24) {
  const tribe = POOLS_TRIBE;
  const seller = ids['e2e-member-a']!;
  const latest = await latestLedgerSequence();
  invoke(
    tribe.daoId,
    'e2e-member-a',
    [
      'approve',
      '--owner',
      seller,
      '--spender',
      tribe.marketplace!,
      '--token_id',
      String(tokenId),
      '--expiration_ledger',
      String(latest + 2_000)
    ],
    'yes'
  );
  invoke(
    tribe.marketplace!,
    'e2e-member-a',
    [
      'list',
      '--token_id',
      String(tokenId),
      '--seller',
      seller,
      '--price',
      String(xlmStroops(price)),
      '--expires_at',
      String(Math.floor(Date.now() / 1000) + hours * 3600),
      '--max_fee_bps',
      String(tribe.feeBps),
      '--payment_asset',
      tribe.paymentAsset!
    ],
    'yes'
  );
}

async function latestLedgerSequence() {
  const response = await fetch('https://soroban-testnet.stellar.org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' })
  });
  return ((await response.json()) as { result: { sequence: number } }).result.sequence;
}

/**
 * Put "E2E Members" and "E2E Members Only" back for W14: e2e-member-a votes for itself on both, its
 * tokens are back with it, and no single-token approval is left on them.
 */
export function resetMemberTribes(ids: Record<string, string>) {
  const changed: string[] = [];
  const memberA = ids['e2e-member-a']!;
  for (const [tribe, tokens] of [
    [MEMBERS_TRIBE, TOKENS.members.memberA],
    [MEMBERS_ONLY_TRIBE, TOKENS.membersOnly.memberA]
  ] as const) {
    for (const tokenId of tokens) {
      const owner = ownerOf(tribe, tokenId);
      if (owner !== memberA) {
        const holder = Object.entries(ids).find(([, address]) => address === owner)?.[0];
        if (!holder) throw new Error(`${tribe.slug} #${tokenId} is held by ${owner}, not a walkthrough identity`);
        invoke(
          tribe.daoId,
          holder,
          ['transfer', '--from', owner, '--to', memberA, '--token_id', String(tokenId)],
          'yes'
        );
        changed.push(`${tribe.slug}: sent #${tokenId} back from ${holder}`);
      }
      if (approvedFor(tribe, tokenId)) {
        invoke(
          tribe.daoId,
          'e2e-member-a',
          [
            'approve',
            '--owner',
            memberA,
            '--spender',
            memberA,
            '--token_id',
            String(tokenId),
            '--expiration_ledger',
            '0'
          ],
          'yes'
        );
        changed.push(`${tribe.slug}: removed the approval on #${tokenId}`);
      }
    }
    const delegate = delegateOf(tribe, memberA);
    if (delegate && delegate !== memberA) {
      invoke(tribe.daoId, 'e2e-member-a', ['delegate', '--account', memberA, '--delegatee', memberA], 'yes');
      changed.push(`${tribe.slug}: e2e-member-a votes for itself again`);
    }
  }
  return changed;
}
