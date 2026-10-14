/**
 * The DAO renewal sweep (docs/STORAGE_DIET.md § 7, membership-models eng review R3).
 *
 * Every key a DAO owns is listed from chain state: the core contracts (Token,
 * Metadata, Governor, Treasury) by ledger reads of their instances and counts,
 * and every module in the Token's registry by its own `renewal_keys(cursor,
 * limit)` pages, read by simulation. The candidate keys are then read to learn
 * which exist and when they expire. The rules mirror `dao_renewal_inventory` in
 * contracts/e2e/src/test.rs, which asserts they cover every persistent key a
 * full DAO lifecycle writes.
 *
 * Per-holder keys (owners, balances, delegations, claim records) are the
 * holder's and stay out, except where the holder is the DAO itself: tokens and
 * asset balances of the Treasury and every registered module, which
 * OpenZeppelin and the asset contract renew only 30 days per touch. Only the
 * latest supply and quorum checkpoints are kept: proposals store their quorum
 * (D33), so history may archive. Shared code is the platform's
 * (scripts/renew-code-ttl.mjs). A module without `renewal_keys` (one deployed
 * outside the Manager) gets its instance renewed and is reported as `uncovered`.
 */
import {
  Account,
  Address,
  Operation,
  scValToNative,
  SorobanDataBuilder,
  type Transaction,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { NULL_ACCOUNT } from '@stellar/stellar-sdk/contract';
import { Api as RpcApi } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

import { decodeStoredProposal } from '@/lib/chain-reads/proposal-core';
import { namespacedKey } from '@/lib/storage-key';
import { LEDGERS_PER_DAY, SECONDS_PER_LEDGER } from '@/lib/ttl-expiry';

export { LEDGERS_PER_DAY, SECONDS_PER_LEDGER };
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
  'claims',
  'modules'
] as const;
export type RenewalClass = (typeof RENEWAL_CLASSES)[number];

export const CLASS_LABELS: Record<RenewalClass, string> = {
  contracts: 'Contracts',
  artwork: 'Artwork',
  tokens: 'Token records',
  proposals: 'Proposals',
  listings: 'Listings',
  holdings: 'Treasury holdings',
  slug: 'Tribe link',
  claims: 'Claim lists',
  modules: 'Module records'
};

export type InventoryKey = {
  cls: RenewalClass;
  label: string;
  key: xdr.LedgerKey;
  /** A required key that is missing must be restored; an optional one may simply not exist. */
  required: boolean;
  /** A temporary entry: extended while it lives, never restored. */
  temporary?: boolean;
};

export type LedgerEntryInfo = { liveUntil: number; bytes: number; val: xdr.LedgerEntryData };
export type LedgerRead = (
  keys: xdr.LedgerKey[]
) => Promise<{ latestLedger: number; entries: Map<string, LedgerEntryInfo> }>;

export type DaoInventory = {
  latestLedger: number;
  /**
   * True when the token instance itself was not returned: the DAO's instances
   * have been evicted and nothing else can be listed until they are restored.
   * `missing` then holds exactly the module instances to restore (from the
   * addresses the caller supplied).
   */
  bootstrap?: boolean;
  /** Keys that exist: what the sweep extends. */
  present: Array<InventoryKey & LedgerEntryInfo>;
  /**
   * Registered modules whose own records the sweep cannot list (no `renewal_keys`):
   * their instance is renewed, the rest is not.
   */
  uncovered: string[];
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

/**
 * A proposal leaves the sweep once it can no longer change state. A client
 * cannot tell Defeated from Succeeded without the tally, so a proposal whose
 * vote ended stays until the 14-day window after `vote_end` has passed: a
 * harmless superset of the contract's rule.
 */
export function proposalIsLive(core: { state: number; vote_end: bigint | number; eta: bigint | number }, now: number) {
  if ([3, 6, 7].includes(core.state)) return false; // Canceled, Expired, Executed
  if (core.state === 5) return now < Number(core.eta) + PROPOSAL_EXPIRY_SECONDS; // Queued
  return now < Number(core.vote_end) + PROPOSAL_EXPIRY_SECONDS; // Pending/Active/Succeeded not yet expired
}

/** One `renewal_keys` page: storage keys (already namespaced), held assets, next cursor. */
export type ModuleRenewalPage = {
  keys: Array<{ key: xdr.ScVal; persistent: boolean }>;
  assets: string[];
  nextCursor: number | null;
};
/** Reads one page by simulation; null when the module has no `renewal_keys`. */
export type ModuleRenewalRead = (module: string, cursor: number) => Promise<ModuleRenewalPage | null>;

/** common::modules::MAX_RENEWAL_PAGE: a page never holds more, whatever the limit asks. */
export const MAX_RENEWAL_PAGE = 200;
/** A module may not list more pages than this; past it the sweep stops and reports it uncovered. */
const MAX_RENEWAL_PAGES = 100;

type ModuleEntry = { kind: string; address: string; non_voting: boolean };

/** Where a module's own records are counted on the Renewal tab. */
function moduleClass(kind: string): RenewalClass {
  return kind === 'marketplace' ? 'listings' : kind === 'claims' ? 'claims' : 'modules';
}

function moduleLabel(kind: string) {
  const name = kind.replace(/^custom_/, '').replace(/_/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function moduleDataKey(contract: string, key: xdr.ScVal, persistent: boolean): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contract).toScAddress(),
      key,
      durability: persistent ? xdr.ContractDataDurability.persistent : xdr.ContractDataDurability.temporary
    })
  );
}

/** A readable label for a module key: its variant and arguments (`Pool(2)`, `PoolStock(2, 0)`). */
function keyLabel(key: xdr.ScVal): string {
  try {
    const value = scValToNative(key) as unknown;
    const parts = Array.isArray(value) && value[0] === 'builder' && Array.isArray(value[1]) ? value[1] : value;
    if (Array.isArray(parts) && typeof parts[0] === 'string')
      return parts.length > 1 ? `${parts[0]}(${parts.slice(1).map(String).join(', ')})` : parts[0];
  } catch {
    // fall through
  }
  return 'Record';
}

export async function buildDaoInventory(
  read: LedgerRead,
  scope: {
    manager: string;
    token: string;
    nowSeconds: number;
    /** Every module address, for restoring the instances when the token's own is evicted. */
    modules?: string[];
    /** Extra asset contracts whose DAO balances to sweep (beyond the ones found on chain). */
    assets?: string[];
    /** Pages each registered module's `renewal_keys`; without it only module instances are renewed. */
    renewalKeys?: ModuleRenewalRead;
  }
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

  // A: the token instance holds the wiring and the module registry.
  await fetch([add('contracts', 'Token', instanceKey(scope.token))]);
  const token = instanceStorage(entry(instanceKey(scope.token)));
  const metadata = native<string>(nsGet(token, 'MetadataContract'));
  const treasury = native<string>(nsGet(token, 'Treasury'));
  if (!metadata || !treasury) {
    // Evicted instances: nothing can be read, but the addresses are known.
    if (scope.modules?.length && !entry(instanceKey(scope.token))) {
      const unique = [...new Set([scope.token, ...scope.modules])];
      return {
        latestLedger,
        bootstrap: true,
        present: [],
        missing: unique.map((address, i) => add('contracts', i === 0 ? 'Token' : `Module ${i}`, instanceKey(address))),
        uncovered: []
      };
    }
    throw new Error('The token instance is missing its wiring. Is it archived?');
  }
  const modules = (native<ModuleEntry[]>(nsGet(token, 'Modules')) ?? []).map((registered) => ({
    ...registered,
    kind: String(registered.kind)
  }));
  const minted = count(native(ozGet(token, 'TokenIdCounter')));
  const supplyCheckpoints = count(native(ozGet(token, 'NumTotalSupplyCheckpoints')));

  // B: the other instances, each module's allowance, and the Manager's records of this DAO.
  const b: InventoryKey[] = [
    add('contracts', 'Metadata', instanceKey(metadata)),
    add('contracts', 'Treasury', instanceKey(treasury)),
    add('slug', 'DaoSlug', ns(scope.manager, 'DaoSlug', addr(scope.token)), false),
    add('slug', 'PendingDao', ns(scope.manager, 'PendingDao', addr(scope.token)), false),
    add('slug', 'Assurance', ns(scope.manager, 'Assurance', addr(scope.token)), false)
  ];
  for (const registered of modules) {
    b.push(add('contracts', moduleLabel(registered.kind), instanceKey(registered.address)));
    b.push(add('tokens', 'MintAllowance', ns(scope.token, 'MintAllowance', addr(registered.address)), false));
  }
  for (const kind of new Set(modules.map((registered) => registered.kind)))
    b.push(
      add(
        'slug',
        `ModuleCount(${kind})`,
        ns(scope.manager, 'ModuleCount', addr(scope.token), xdr.ScVal.scvSymbol(kind)),
        false
      )
    );
  await fetch(b);
  const governor = native<string>(nsGet(instanceStorage(entry(instanceKey(treasury))), 'Governor'));
  const meta = instanceStorage(entry(instanceKey(metadata)));
  const itemCounts = (native<unknown[]>(nsGet(meta, 'ItemCounts')) ?? []).map(Number);
  const slugEntry = entry(ns(scope.manager, 'DaoSlug', addr(scope.token)));
  const slug = slugEntry ? (scValToNative(dataValue(slugEntry)) as string) : null;

  // The asset contracts the DAO is paid in: the auction's, and every asset a module reports holding.
  const assets = new Set<string>(scope.assets ?? []);
  const auction = modules.find((registered) => registered.kind === 'auction')?.address;
  const auctionConfig =
    auction && entry(instanceKey(auction))
      ? native<{ payment_token?: string }>(nsGet(instanceStorage(entry(instanceKey(auction))), 'Config'))
      : undefined;
  if (auctionConfig?.payment_token) assets.add(auctionConfig.payment_token);
  const holders = [treasury, ...modules.map((registered) => registered.address)];

  // C: each live module's own records, from its renewal_keys pages.
  const uncovered: string[] = [];
  const c: InventoryKey[] = [];
  for (const registered of modules) {
    if (!entry(instanceKey(registered.address))) continue; // archived: restored first, listed on the next run
    if (!scope.renewalKeys) continue;
    let cursor: number | null = 0;
    let pages = 0;
    while (cursor !== null) {
      const page: ModuleRenewalPage | null = await scope.renewalKeys(registered.address, cursor);
      if (!page || (pages += 1) > MAX_RENEWAL_PAGES) {
        uncovered.push(registered.address);
        break;
      }
      for (const asset of page.assets) if (asset !== scope.token) assets.add(asset);
      for (const item of page.keys)
        c.push({
          ...add(
            moduleClass(registered.kind),
            keyLabel(item.key),
            moduleDataKey(registered.address, item.key, item.persistent),
            false
          ),
          temporary: !item.persistent
        });
      cursor = page.nextCursor !== null && page.nextCursor > cursor ? page.nextCursor : null;
    }
  }

  // D: artwork, token pages and checkpoints, the governor instance, the slug pair.
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
  await fetch(c);

  // An open listing or pool was priced in the asset of its day; its escrow and fee are paid in it
  // even after the module's asset changes.
  for (const k of c) {
    if (k.cls !== 'listings' && k.cls !== 'claims') continue;
    const info = entry(k.key);
    if (!info) continue;
    try {
      const record = scValToNative(dataValue(info)) as { payment_asset?: unknown; asset?: unknown } | null;
      for (const asset of [record?.payment_asset, record?.asset])
        if (typeof asset === 'string' && asset.startsWith('C')) assets.add(asset);
    } catch {
      // Not a record with an asset (a stock page).
    }
  }
  const balances: InventoryKey[] = [];
  for (const holder of holders) {
    balances.push(add('holdings', 'Token balance', oz(scope.token, 'Balance', addr(holder)), false));
    for (const asset of assets)
      balances.push(add('holdings', 'Asset balance', oz(asset, 'Balance', addr(holder)), false));
  }
  await fetch(balances);

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

  // E: proposals (ids, then cores and tallies) and quorum checkpoints.
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
      const core = decodeStoredProposal(dataValue(info));
      if (!proposalIsLive({ state: core.state, vote_end: core.voteEnd, eta: core.eta }, scope.nowSeconds)) return;
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
    else if ((info || k.required) && !k.temporary) missing.push(k);
  }
  return { latestLedger, present, missing, uncovered };
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

function field(map: xdr.ScMapEntry[], name: string) {
  const item = map.find((entry) => entry.key.type === 'scvSymbol' && String(entry.key.value) === name);
  if (!item) throw new Error(`renewal_keys returned no ${name}.`);
  return item.val;
}

/** Decode a `common::modules::RenewalPage` return value, keeping each key as raw XDR. */
export function parseRenewalPage(value: xdr.ScVal): ModuleRenewalPage {
  if (value.type !== 'scvMap' || !value.value) throw new Error('renewal_keys did not return a page.');
  const map = value.value as xdr.ScMapEntry[];
  const keys = field(map, 'keys');
  const assets = field(map, 'assets');
  const next = field(map, 'next_cursor');
  if (keys.type !== 'scvVec' || assets.type !== 'scvVec') throw new Error('Malformed renewal_keys page.');
  return {
    keys: ((keys.value ?? []) as xdr.ScVal[]).map((pair) => {
      const items = (pair.type === 'scvVec' ? pair.value : null) as xdr.ScVal[] | null;
      if (!items || items.length !== 2 || items[1]!.type !== 'scvBool') throw new Error('Malformed renewal key.');
      return { key: items[0]!, persistent: scValToNative(items[1]!) as boolean };
    }),
    assets: ((assets.value ?? []) as xdr.ScVal[]).map((asset) => Address.fromScVal(asset).toString()),
    nextCursor: next.type === 'scvVoid' ? null : Number(scValToNative(next))
  };
}

/**
 * A `ModuleRenewalRead` over Soroban RPC simulation of `renewal_keys(cursor, MAX_RENEWAL_PAGE)`.
 * A simulation error (no such function, or a module that panics) reads as null: the module is
 * then reported as not covered by the sweep, and only its instance is renewed.
 */
export function rpcModuleRenewal(
  server: { simulateTransaction: (tx: Transaction) => Promise<RpcApi.SimulateTransactionResponse> },
  networkPassphrase: string
): ModuleRenewalRead {
  return async (module, cursor) => {
    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, '0'), { fee: '100', networkPassphrase })
      .addOperation(
        Operation.invokeContractFunction({
          contract: module,
          function: 'renewal_keys',
          args: [u32(cursor), u32(MAX_RENEWAL_PAGE)]
        })
      )
      .setTimeout(30)
      .build();
    const simulation = await server.simulateTransaction(tx);
    if (!RpcApi.isSimulationSuccess(simulation) || !simulation.result) return null;
    return parseRenewalPage(simulation.result.retval);
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

/**
 * Status of shared contract code for the platform's eye. Contracts bump code
 * only 2 → 4 days, so the member-facing thresholds (45 and 14 days) are too
 * late for the platform to act: warn at 60 days and call it critical at 14.
 */
export type CodeStatus = 'healthy' | 'soon' | 'critical' | 'expired' | 'unknown';
export const CODE_WARN_DAYS = 60;
export const CODE_CRITICAL_DAYS = 14;
export function codeHealthStatus(liveUntil: number | null, latestLedger: number): CodeStatus {
  if (liveUntil === null) return 'unknown';
  const remaining = liveUntil - latestLedger;
  if (remaining < 0) return 'expired';
  if (remaining <= CODE_CRITICAL_DAYS * LEDGERS_PER_DAY) return 'critical';
  if (remaining <= CODE_WARN_DAYS * LEDGERS_PER_DAY) return 'soon';
  return 'healthy';
}

/**
 * A platform contract's upgrade notice in force, from its instance storage
 * (`common::upgrade::delay`): a pending reduction once its ledger has come,
 * else the recorded value, else the recommended 7 days.
 */
export const RECOMMENDED_UPGRADE_DELAY = 7 * LEDGERS_PER_DAY;
export function effectiveUpgradeDelay(instance: LedgerEntryInfo | undefined, latestLedger: number): number {
  const storage = instanceStorage(instance);
  const pending = native<{ ledgers: number; effective_ledger: number }>(nsGet(storage, 'PendingUpgradeDelay'));
  if (pending && latestLedger >= Number(pending.effective_ledger)) return Number(pending.ledgers);
  const recorded = native<number>(nsGet(storage, 'UpgradeDelay'));
  return recorded === undefined ? RECOMMENDED_UPGRADE_DELAY : Number(recorded);
}
