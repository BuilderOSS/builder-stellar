/**
 * The DAO renewal sweep (docs/STORAGE_DIET.md § 7).
 *
 * Every key a DAO owns is listed from chain state alone, with ledger reads
 * only (no simulation): module instances give the wiring and counts, then the
 * candidate keys are read to learn which exist and when they expire. The rules
 * mirror `dao_renewal_inventory` in contracts/e2e/src/test.rs, which asserts
 * they cover every persistent key a full DAO lifecycle writes.
 *
 * Per-holder keys (owners, balances, delegations, refunds, claim markers) are
 * the holder's and stay out, except where the holder is the DAO itself: the
 * Treasury's, Auction's and Marketplace's tokens and asset balances, which
 * OpenZeppelin and the asset contract renew only 30 days per touch. Only the
 * latest supply and quorum checkpoints are kept: proposals store their quorum
 * (D33), so history may archive. Shared code is the platform's
 * (scripts/renew-code-ttl.mjs).
 */
import {
  type Account,
  Address,
  Operation,
  scValToNative,
  SorobanDataBuilder,
  type Transaction,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

import { namespacedKey } from '@/lib/storage-key';

export const LEDGERS_PER_DAY = 17_280;
export const SECONDS_PER_LEDGER = 5;
/** Live testnet limits read 2026-10-12; a batch keeps a margin under each. */
export const TX_MAX_FOOTPRINT_ENTRIES = 400;
export const TX_MAX_READ_BYTES = 200_000;
const BATCH_ENTRIES = 360;
const BATCH_BYTES = 180_000;
/** Proposal and queued-execution windows past which a proposal is over (PROPOSAL_EXPIRATION_PERIOD). */
const PROPOSAL_EXPIRY_SECONDS = 1_209_600;

export const RENEWAL_CLASSES = [
  'contracts',
  'artwork',
  'tokens',
  'proposals',
  'listings',
  'holdings',
  'slug',
  'claims'
] as const;
export type RenewalClass = (typeof RENEWAL_CLASSES)[number];

export const CLASS_LABELS: Record<RenewalClass, string> = {
  contracts: 'Contracts',
  artwork: 'Artwork',
  tokens: 'Token records',
  proposals: 'Proposals',
  listings: 'Listings',
  holdings: 'Treasury holdings',
  slug: 'Community link',
  claims: 'Claim rounds'
};

export type InventoryKey = {
  cls: RenewalClass;
  label: string;
  key: xdr.LedgerKey;
  /** A required key that is missing must be restored; an optional one may simply not exist. */
  required: boolean;
};

export type LedgerEntryInfo = { liveUntil: number; bytes: number; val: xdr.LedgerEntryData };
export type LedgerRead = (
  keys: xdr.LedgerKey[]
) => Promise<{ latestLedger: number; entries: Map<string, LedgerEntryInfo> }>;

export type DaoInventory = {
  latestLedger: number;
  /** Keys that exist: what the sweep extends. */
  present: Array<InventoryKey & LedgerEntryInfo>;
  /**
   * Keys to restore first: required ones the RPC did not return, and any the
   * RPC returned with a live-until ledger already past (archived).
   */
  missing: InventoryKey[];
};

const keyId = (key: xdr.LedgerKey) => key.toXDR('base64');

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

function dataKey(contract: string, key: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contract).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

export const instanceKey = (contract: string) => dataKey(contract, xdr.ScVal.scvLedgerKeyContractInstance());
const ns = (contract: string, variant: string, ...args: xdr.ScVal[]) =>
  dataKey(contract, namespacedKey(variant, ...args));
const ozKey = (variant: string, ...args: xdr.ScVal[]) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...args]);
const oz = (contract: string, variant: string, ...args: xdr.ScVal[]) => dataKey(contract, ozKey(variant, ...args));
const u32 = (n: number) => xdr.ScVal.scvU32(n);
const u64 = (n: bigint | number) => xdr.ScVal.scvU64(BigInt(n));
const addr = (a: string) => new Address(a).toScVal();

// ---------------------------------------------------------------------------
// Instance storage
// ---------------------------------------------------------------------------

type InstanceMap = Map<string, xdr.ScVal>;

/** The stored value of a contract-data entry. */
function dataValue(entry: LedgerEntryInfo): xdr.ScVal {
  if (entry.val.type !== 'contractData') throw new Error('Unexpected ledger entry type.');
  return entry.val.contractData.val;
}

function instanceStorage(entry: LedgerEntryInfo | undefined): InstanceMap {
  const map: InstanceMap = new Map();
  if (!entry || entry.val.type !== 'contractData') return map;
  const val = dataValue(entry);
  if (val.type !== 'scvContractInstance') return map;
  for (const item of val.instance.storage ?? []) map.set(item.key.toXDR('base64'), item.val);
  return map;
}
const nsGet = (map: InstanceMap, variant: string) => map.get(namespacedKey(variant).toXDR('base64'));
const ozGet = (map: InstanceMap, variant: string) => map.get(ozKey(variant).toXDR('base64'));
function native<T>(value: xdr.ScVal | undefined): T | undefined {
  return value === undefined ? undefined : (scValToNative(value) as T);
}
const count = (value: unknown) => (value === undefined || value === null ? 0 : Number(value));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/** A proposal leaves the sweep once it can no longer change state. */
export function proposalIsLive(core: { state: number; vote_end: bigint | number; eta: bigint | number }, now: number) {
  if ([3, 6, 7].includes(core.state)) return false; // Canceled, Expired, Executed
  if (core.state === 5) return now < Number(core.eta) + PROPOSAL_EXPIRY_SECONDS; // Queued
  return now < Number(core.vote_end) + PROPOSAL_EXPIRY_SECONDS; // Pending/Active/Succeeded not yet expired
}

export async function buildDaoInventory(
  read: LedgerRead,
  scope: { manager: string; token: string; nowSeconds: number }
): Promise<DaoInventory> {
  const keys: InventoryKey[] = [];
  const found = new Map<string, LedgerEntryInfo>();
  let latestLedger = 0;
  const fetch = async (list: InventoryKey[]) => {
    if (!list.length) return;
    const result = await read(list.map((k) => k.key));
    latestLedger = Math.max(latestLedger, result.latestLedger);
    for (const [id, info] of result.entries) found.set(id, info);
    keys.push(...list);
  };
  const entry = (key: xdr.LedgerKey) => found.get(keyId(key));
  const add = (cls: RenewalClass, label: string, key: xdr.LedgerKey, required = true): InventoryKey => ({
    cls,
    label,
    key,
    required
  });

  // A: the token instance holds the wiring.
  await fetch([add('contracts', 'Token', instanceKey(scope.token))]);
  const token = instanceStorage(entry(instanceKey(scope.token)));
  const metadata = native<string>(nsGet(token, 'MetadataContract'));
  const treasury = native<string>(nsGet(token, 'Treasury'));
  const auction = native<string>(nsGet(token, 'Auction'));
  const marketplace = native<string>(nsGet(token, 'Marketplace'));
  const minter = native<string>(nsGet(token, 'Minter'));
  if (!metadata || !treasury) throw new Error('The token instance is missing its wiring. Is it archived?');
  const minted = count(native(ozGet(token, 'TokenIdCounter')));
  const supplyCheckpoints = count(native(ozGet(token, 'NumTotalSupplyCheckpoints')));

  // B: the other instances, the slug, the claim round and the canonical mint grants.
  const b: InventoryKey[] = [
    add('contracts', 'Metadata', instanceKey(metadata)),
    add('contracts', 'Treasury', instanceKey(treasury)),
    add('slug', 'DaoSlug', ns(scope.manager, 'DaoSlug', addr(scope.token)), false)
  ];
  if (auction) b.push(add('contracts', 'Auction', instanceKey(auction)));
  if (marketplace) b.push(add('contracts', 'Marketplace', instanceKey(marketplace)));
  if (minter) {
    b.push(add('claims', 'MerkleRoot', ns(minter, 'MerkleRoot', addr(scope.token)), false));
    b.push(add('claims', 'MerkleRound', ns(minter, 'MerkleRound', addr(scope.token)), false));
  }
  for (const holder of [treasury, auction, marketplace, minter].filter((a): a is string => Boolean(a)))
    b.push(add('tokens', 'MintAuthority', ns(scope.token, 'MintAuthority', addr(holder)), false));
  await fetch(b);
  const governor = native<string>(nsGet(instanceStorage(entry(instanceKey(treasury))), 'Governor'));
  const meta = instanceStorage(entry(instanceKey(metadata)));
  const itemCounts = (native<unknown[]>(nsGet(meta, 'ItemCounts')) ?? []).map(Number);
  const nextListing = marketplace
    ? count(native(nsGet(instanceStorage(entry(instanceKey(marketplace))), 'NextListingId')))
    : 0;
  const slugEntry = entry(ns(scope.manager, 'DaoSlug', addr(scope.token)));
  const slug = slugEntry ? (scValToNative(dataValue(slugEntry)) as string) : null;

  // The asset contracts the DAO is paid in, from the auction and market configs.
  const assets = new Set<string>();
  const auctionConfig = auction
    ? native<{ payment_token?: string }>(nsGet(instanceStorage(entry(instanceKey(auction))), 'Config'))
    : undefined;
  const marketConfig = marketplace
    ? native<{ payment_asset?: string }>(nsGet(instanceStorage(entry(instanceKey(marketplace))), 'Config'))
    : undefined;
  if (auctionConfig?.payment_token) assets.add(auctionConfig.payment_token);
  if (marketConfig?.payment_asset) assets.add(marketConfig.payment_asset);
  const holders = [treasury, auction, marketplace].filter((a): a is string => Boolean(a));

  // C: artwork, token pages and checkpoints, listings, holdings, the governor instance.
  const c: InventoryKey[] = [];
  if (governor) c.push(add('contracts', 'Governor', instanceKey(governor)));
  if (slug) c.push(add('slug', 'SlugToDao', ns(scope.manager, 'SlugToDao', xdr.ScVal.scvString(slug))));
  if (itemCounts.length) {
    c.push(add('artwork', 'PropertyNames', ns(metadata, 'PropertyNames')));
    c.push(add('artwork', 'IpfsGroups', ns(metadata, 'IpfsGroups')));
  }
  itemCounts.forEach((items, property) => {
    for (let page = 0; page < Math.ceil(items / ITEMS_PER_PAGE); page += 1)
      c.push(add('artwork', `Items(${property}, ${page})`, ns(metadata, 'Items', u32(property), u32(page))));
  });
  // Every mint writes its token's record (empty before artwork), so each page up to the count exists.
  for (let page = 0; minted > 0 && page <= Math.floor((minted - 1) / TOKENS_PER_ATTRIBUTE_PAGE); page += 1)
    c.push(add('artwork', `AttributesPage(${page})`, ns(metadata, 'AttributesPage', u32(page))));
  if (supplyCheckpoints > 0)
    c.push(
      add(
        'tokens',
        `TotalSupplyCheckpoint(${supplyCheckpoints - 1})`,
        oz(scope.token, 'TotalSupplyCheckpoint', u32(supplyCheckpoints - 1))
      )
    );
  for (const holder of holders) {
    c.push(add('holdings', 'Token balance', oz(scope.token, 'Balance', addr(holder)), false));
    for (const asset of assets) c.push(add('holdings', 'Asset balance', oz(asset, 'Balance', addr(holder)), false));
  }
  if (marketplace) {
    for (let t = 0; t < minted; t += 1)
      c.push(add('listings', `Listing(${t})`, ns(marketplace, 'Listing', u32(t)), false));
    for (let l = 0; l < nextListing; l += 1)
      c.push(add('listings', `PrimaryListing(${l})`, ns(marketplace, 'PrimaryListing', u64(l)), false));
  }
  await fetch(c);

  // Tokens the DAO itself holds: read every ownership entry, keep the DAO's.
  // A holder's entry that archived is simply not returned; it is theirs to restore.
  if (minted > 0) {
    const owners = Array.from({ length: minted }, (_, t) => oz(scope.token, 'Owner', u32(t)));
    const ownerRead = await read(owners);
    latestLedger = Math.max(latestLedger, ownerRead.latestLedger);
    const held: InventoryKey[] = [];
    owners.forEach((key, t) => {
      const info = ownerRead.entries.get(keyId(key));
      if (info && holders.includes(scValToNative(dataValue(info)) as string))
        held.push(add('holdings', `Token #${t}`, key));
    });
    await fetch(held);
  }

  // D/E: proposals (ids, then cores and tallies) and quorum checkpoints.
  if (governor) {
    const gov = instanceStorage(entry(instanceKey(governor)));
    const proposals = count(native(nsGet(gov, 'ProposalCount')));
    const quorumCheckpoints = count(native(ozGet(gov, 'NumQuorumCheckpoints')));
    const latestQuorum = quorumCheckpoints - 1;
    const ids = Array.from({ length: proposals }, (_, seq) =>
      add('proposals', `ProposalId(${seq})`, ns(governor, 'ProposalId', u32(seq)), false)
    );
    const checkpoints =
      latestQuorum >= 0
        ? [add('proposals', `QuorumCheckpoint(${latestQuorum})`, oz(governor, 'QuorumCheckpoint', u32(latestQuorum)))]
        : [];
    // Proposal entries are fetched first and kept only while the proposal is live.
    const idRead = await read(ids.map((k) => k.key));
    latestLedger = Math.max(latestLedger, idRead.latestLedger);
    const live: InventoryKey[] = [];
    const cores: InventoryKey[] = [];
    ids.forEach((idKey, seq) => {
      const info = idRead.entries.get(keyId(idKey.key));
      if (!info) return;
      const id = dataValue(info);
      cores.push(add('proposals', `ProposalTime(${seq})`, ns(governor, 'ProposalTime', id), false));
    });
    const coreRead = await read(cores.map((k) => k.key));
    latestLedger = Math.max(latestLedger, coreRead.latestLedger);
    cores.forEach((coreKey, index) => {
      const info = coreRead.entries.get(keyId(coreKey.key));
      if (!info) return;
      const core = scValToNative(dataValue(info)) as {
        state: number;
        vote_end: bigint;
        eta: bigint;
        seq: number;
      };
      if (!proposalIsLive(core, scope.nowSeconds)) return;
      const idKey = ids[core.seq] ?? ids[index]!;
      const id = dataValue(idRead.entries.get(keyId(idKey.key))!);
      live.push(
        { ...coreKey, required: true },
        { ...idKey, required: true },
        add('proposals', `ProposalVote(${core.seq})`, oz(governor, 'ProposalVote', id), false)
      );
    });
    await fetch([...live, ...checkpoints]);
  }

  const present: DaoInventory['present'] = [];
  const missing: InventoryKey[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const id = keyId(k.key);
    if (seen.has(id)) continue;
    seen.add(id);
    const info = found.get(id);
    if (info && info.liveUntil >= latestLedger) present.push({ ...k, ...info });
    else if (info || k.required) missing.push(k);
  }
  return { latestLedger, present, missing };
}

/** metadata::ITEMS_PER_PAGE and TOKENS_PER_ATTRIBUTE_PAGE (contracts/metadata/src/storage.rs). */
export const ITEMS_PER_PAGE = 32;
export const TOKENS_PER_ATTRIBUTE_PAGE = 64;

// ---------------------------------------------------------------------------
// Summaries and transactions
// ---------------------------------------------------------------------------

export type ClassSummary = {
  cls: RenewalClass;
  keys: number;
  bytes: number;
  /** Earliest live-until ledger in the class; null when it has no keys. */
  earliestLiveUntil: number | null;
  missing: number;
};

export function summarizeInventory(inventory: DaoInventory): ClassSummary[] {
  return RENEWAL_CLASSES.map((cls) => {
    const present = inventory.present.filter((k) => k.cls === cls);
    return {
      cls,
      keys: present.length,
      bytes: present.reduce((sum, k) => sum + k.bytes, 0),
      earliestLiveUntil: present.length ? Math.min(...present.map((k) => k.liveUntil)) : null,
      missing: inventory.missing.filter((k) => k.cls === cls).length
    };
  }).filter((summary) => summary.keys > 0 || summary.missing > 0);
}

/** Split keys into batches under the footprint and read-bytes limits (usually one). */
export function planBatches<T extends { bytes: number }>(keys: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const key of keys) {
    if (current.length && (current.length >= BATCH_ENTRIES || bytes + key.bytes > BATCH_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(key);
    bytes += key.bytes;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** One `ExtendFootprintTTL` over `keys` to `extendTo` ledgers from now (unprepared). */
export function extendTransaction(source: Account, keys: xdr.LedgerKey[], extendTo: number, passphrase: string) {
  return new TransactionBuilder(source, { fee: '100', networkPassphrase: passphrase })
    .setSorobanData(new SorobanDataBuilder().setReadOnly(keys).build())
    .addOperation(Operation.extendFootprintTtl({ extendTo }))
    .setTimeout(180)
    .build();
}

/** One `RestoreFootprint` over archived `keys` (unprepared). */
export function restoreTransaction(source: Account, keys: xdr.LedgerKey[], passphrase: string) {
  return new TransactionBuilder(source, { fee: '100', networkPassphrase: passphrase })
    .setSorobanData(new SorobanDataBuilder().setReadWrite(keys).build())
    .addOperation(Operation.restoreFootprint({}))
    .setTimeout(180)
    .build();
}

export type PreparedSweep = { transactions: Transaction[]; fee: bigint };

/** Ledgers from now to extend to, capped one under the network's maximum entry TTL. */
export function extendToLedgers(days: number, maxEntryTtl: number) {
  return Math.max(1, Math.min(Math.round(days * LEDGERS_PER_DAY), maxEntryTtl - 1));
}

export function estimateDate(liveUntil: number, latestLedger: number, nowMs: number) {
  return new Date(nowMs + (liveUntil - latestLedger) * SECONDS_PER_LEDGER * 1000);
}

/** Keys per getLedgerEntries request (the RPC rejects large batches). */
const KEYS_PER_REQUEST = 100;

/** A `LedgerRead` over Soroban RPC `getLedgerEntries`, batched. Entry size counts the key and value XDR. */
export function rpcLedgerRead(server: {
  getLedgerEntries: (...keys: xdr.LedgerKey[]) => Promise<{
    latestLedger: number;
    entries: Array<{ key: xdr.LedgerKey; val: xdr.LedgerEntryData; liveUntilLedgerSeq?: number }>;
  }>;
}): LedgerRead {
  return async (keys) => {
    const entries = new Map<string, LedgerEntryInfo>();
    let latestLedger = 0;
    for (let i = 0; i < keys.length; i += KEYS_PER_REQUEST) {
      const response = await server.getLedgerEntries(...keys.slice(i, i + KEYS_PER_REQUEST));
      latestLedger = Math.max(latestLedger, response.latestLedger);
      for (const entry of response.entries) {
        if (entry.liveUntilLedgerSeq === undefined) continue;
        entries.set(entry.key.toXDR('base64'), {
          liveUntil: entry.liveUntilLedgerSeq,
          bytes: entry.key.toXDR().length + entry.val.toXDR().length,
          val: entry.val
        });
      }
    }
    return { latestLedger, entries };
  };
}

/**
 * The wasm hash a contract instance runs, as hex; null for a Stellar Asset
 * Contract or a value that is not an instance. In this SDK `wasmHash` is an
 * XDR `Hash` wrapper whose bytes are `.value`.
 */
export function instanceWasmHash(value: xdr.ScVal): string | null {
  if (value.type !== 'scvContractInstance' || value.instance.executable.type !== 'contractExecutableWasm') return null;
  const hash = value.instance.executable.wasmHash as unknown as Uint8Array | { value: Uint8Array };
  return Buffer.from(hash instanceof Uint8Array ? hash : hash.value).toString('hex');
}

/**
 * What keeping every present key alive for a year costs at the rate a quote
 * implies, in stroops; null when the quote added no time to anything. The
 * extend fee is rent for the ledgers each key gains, so the rate is the fee
 * over `sum(bytes * ledgers added)`. Rent is linear in time: renewing for 180
 * days twice costs what renewing for 30 days twelve times does, minus the
 * transaction overhead, so a longer renewal is never more expensive per year.
 */
export function yearlyRentEstimate(
  inventory: Pick<DaoInventory, 'present' | 'latestLedger'>,
  extendTo: number,
  extendFee: bigint
): bigint | null {
  let byteLedgers = 0;
  let bytes = 0;
  for (const key of inventory.present) {
    const remaining = key.liveUntil - inventory.latestLedger;
    byteLedgers += key.bytes * Math.max(0, extendTo - remaining);
    bytes += key.bytes;
  }
  if (byteLedgers === 0 || extendFee <= 0n) return null;
  const year = BigInt(bytes) * BigInt(365 * LEDGERS_PER_DAY);
  return (extendFee * year) / BigInt(byteLedgers);
}
