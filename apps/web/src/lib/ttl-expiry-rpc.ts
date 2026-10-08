/**
 * Read live-until ledgers for a DAO's shared module code and artwork entries.
 *
 * Key encodings (verified against the rehearsal DAO on testnet, see ttl-expiry.live.test.ts):
 * - Module instance: contract data, key `ScVal::LedgerKeyContractInstance`, persistent durability.
 *   Its `executable.wasm` is the WASM hash the module runs, which is the code entry we renew.
 * - Shared code: `LedgerKey::ContractCode(hash)`.
 * - Metadata instance storage: `PropertyCount` and `IpfsGroupCount` (unit enum keys `[symbol]`).
 * - Artwork persistent entries, `DataKey` enum variants as `[symbol, ...args]` vecs:
 *   `Property(i)` -> `["Property", i]`, `Item(i, j)` -> `["Item", i, j]`, `IpfsGroup(g)` -> `["IpfsGroup", g]`.
 *
 * The RPC omits entries that are absent or archived, so an omitted key is reported as missing.
 */
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { type Api, Server } from '@stellar/stellar-sdk/rpc';

import { artworkEntryTotal, assessEntries, estimateExpiryDate, type TtlAssessment, type TtlEntry } from './ttl-expiry';

export const DAO_MODULES = ['token', 'metadata', 'auction', 'governor', 'treasury', 'marketplace'] as const;
export type DaoModuleName = (typeof DAO_MODULES)[number];
export type DaoModuleAddresses = Partial<Record<DaoModuleName, string>>;

/** Keys per getLedgerEntries request (the RPC rejects large batches). */
const KEYS_PER_REQUEST = 100;

export type TtlSection = {
  assessment: TtlAssessment;
  entries: TtlEntry[];
  /** Estimated expiry, or `null` when an entry is missing. */
  expiresAt: Date | null;
};

export type ArtworkTtlSection = TtlSection & {
  propertyCount: number;
  ipfsGroupCount: number;
  /** Items per property header, in index order (0 for an unreadable header). */
  itemCounts: number[];
  /** Flat entries the contract's `bump_artwork_ttl` walks (items then IPFS groups). */
  totalEntries: number;
};

export type DaoTtlReport = {
  latestLedger: number;
  readAt: number;
  /** Shared module code, one entry per distinct WASM hash. */
  code: TtlSection & {
    /** Module WASM hashes, keyed by module name (missing when the instance is absent). */
    wasmHashes: Partial<Record<DaoModuleName, string>>;
    /** Modules with no address in the config; they are not checked. */
    unconfigured: DaoModuleName[];
  };
  /** `null` when the DAO has no metadata contract address configured yet. */
  artwork: ArtworkTtlSection | null;
};

export function createRpcServer(rpcUrl: string): Server {
  return new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

function contractDataKey(contractId: string, key: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent
    })
  );
}

export function contractInstanceKey(contractId: string): xdr.LedgerKey {
  return contractDataKey(contractId, xdr.ScVal.scvLedgerKeyContractInstance());
}

export function contractCodeKey(wasmHashHex: string): xdr.LedgerKey {
  if (!/^[0-9a-f]{64}$/i.test(wasmHashHex)) {
    throw new Error(`Invalid WASM hash: ${wasmHashHex}`);
  }
  return xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(wasmHashHex, 'hex') }));
}

const sym = (value: string) => xdr.ScVal.scvSymbol(value);
const u32 = (value: number) => xdr.ScVal.scvU32(value);

export function propertyKey(metadataId: string, index: number): xdr.LedgerKey {
  return contractDataKey(metadataId, xdr.ScVal.scvVec([sym('Property'), u32(index)]));
}

export function itemKey(metadataId: string, propertyIndex: number, itemIndex: number): xdr.LedgerKey {
  return contractDataKey(metadataId, xdr.ScVal.scvVec([sym('Item'), u32(propertyIndex), u32(itemIndex)]));
}

export function ipfsGroupKey(metadataId: string, index: number): xdr.LedgerKey {
  return contractDataKey(metadataId, xdr.ScVal.scvVec([sym('IpfsGroup'), u32(index)]));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Fetch entries in chunks and index them by the requested key's XDR. Keys the RPC did not
 * return are absent from the map (absent or archived).
 */
async function fetchEntries(server: Server, keys: xdr.LedgerKey[]): Promise<Map<string, Api.LedgerEntryResult>> {
  const found = new Map<string, Api.LedgerEntryResult>();
  for (let offset = 0; offset < keys.length; offset += KEYS_PER_REQUEST) {
    const chunk = keys.slice(offset, offset + KEYS_PER_REQUEST);
    const response = await server.getLedgerEntries(...chunk);
    for (const entry of response.entries) {
      found.set(entry.key.toXDR('base64'), entry);
    }
  }
  return found;
}

/** Live-until for a requested key, or `null` when the RPC did not return it. */
function liveUntilOf(found: Map<string, Api.LedgerEntryResult>, key: xdr.LedgerKey): number | null {
  const entry = found.get(key.toXDR('base64'));
  if (!entry) return null;
  if (typeof entry.liveUntilLedgerSeq !== 'number') {
    // A live persistent entry or contract code entry always carries a live-until. Fail loudly
    // rather than report an unknown expiry as healthy or as expired.
    throw new Error('RPC returned a ledger entry without liveUntilLedgerSeq');
  }
  return entry.liveUntilLedgerSeq;
}

/** The ScVal stored in a contract data entry (`LedgerEntryData.contractData.val`). */
function contractDataValue(entry: Api.LedgerEntryResult): xdr.ScVal {
  // The SDK's parsed entry exposes the contract data body as `value.val` at runtime, which
  // the public d.ts does not describe.
  const body = entry.val as unknown as { value?: { val?: xdr.ScVal } };
  if (!body.value?.val) {
    throw new Error('Expected a contract data ledger entry');
  }
  return body.value.val;
}

type InstanceView = {
  wasmHash: string;
  storage: Map<string, unknown>;
};

/** Decode a module instance: its WASM hash and instance storage keyed by name. */
export function readInstance(entry: Api.LedgerEntryResult): InstanceView {
  const scVal = contractDataValue(entry);
  // ContractExecutableWasm exposes its hash as a Hash wrapper whose `value` holds the 32 bytes.
  const body = scVal as unknown as {
    instance: {
      executable?: { wasmHash?: { value?: Uint8Array } };
      storage: { key: xdr.ScVal; val: xdr.ScVal }[] | null;
    };
  };
  const hashBytes = body.instance.executable?.wasmHash?.value;
  if (!hashBytes) {
    throw new Error('Contract instance is not a WASM contract');
  }
  const wasmHash = Buffer.from(hashBytes).toString('hex');

  const storage = new Map<string, unknown>();
  for (const item of body.instance.storage ?? []) {
    const keyNative = scValToNative(item.key) as unknown;
    const name = Array.isArray(keyNative) ? String(keyNative[0]) : String(keyNative);
    storage.set(name, scValToNative(item.val));
  }
  return { wasmHash, storage };
}

function countFrom(storage: Map<string, unknown>, name: string): number {
  const value = storage.get(name);
  if (value === undefined) return 0; // the contract reads a missing count as 0
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Unexpected ${name} value in metadata instance storage`);
  }
  return value;
}

function itemCountFrom(entry: Api.LedgerEntryResult): number {
  const native = scValToNative(contractDataValue(entry)) as { item_count?: unknown };
  if (typeof native.item_count !== 'number' || !Number.isInteger(native.item_count) || native.item_count < 0) {
    throw new Error('Unexpected property header shape');
  }
  return native.item_count;
}

function section(entries: TtlEntry[], latestLedger: number, readAt: number): TtlSection {
  const assessment = assessEntries(entries, latestLedger);
  return {
    assessment,
    entries,
    expiresAt: assessment.remainingLedgers === null ? null : estimateExpiryDate(assessment.remainingLedgers, readAt)
  };
}

/**
 * Read the TTL state of a DAO: the shared code of its six modules and the artwork entries
 * of its metadata contract. Missing entries make their section expired.
 */
export async function readDaoTtlReport(rpcUrl: string, modules: DaoModuleAddresses): Promise<DaoTtlReport> {
  const server = createRpcServer(rpcUrl);
  const configured = DAO_MODULES.filter((name) => Boolean(modules[name]));
  const unconfigured = DAO_MODULES.filter((name) => !modules[name]);
  if (configured.length === 0) {
    throw new Error('No DAO module contract addresses are configured');
  }

  // Batch 1: the latest ledger and every module instance (gives the WASM hashes and the metadata instance).
  const instanceKeys = configured.map((name) => [name, contractInstanceKey(modules[name] as string)] as const);
  const [latest, instanceFound] = await Promise.all([
    server.getLatestLedger(),
    fetchEntries(
      server,
      instanceKeys.map(([, key]) => key)
    )
  ]);
  const readAt = Date.now();
  const latestLedger = latest.sequence;

  const wasmHashes: Partial<Record<DaoModuleName, string>> = {};
  const instanceMissing: DaoModuleName[] = [];
  let metadataInstanceLive: number | null = null;
  let metadataStorage: Map<string, unknown> | null = null;
  for (const [name, key] of instanceKeys) {
    const entry = instanceFound.get(key.toXDR('base64'));
    if (!entry) {
      instanceMissing.push(name);
      continue;
    }
    const instance = readInstance(entry);
    wasmHashes[name] = instance.wasmHash;
    if (name === 'metadata') {
      metadataInstanceLive = liveUntilOf(instanceFound, key);
      metadataStorage = instance.storage;
    }
  }

  // Shared code: one entry per distinct WASM hash.
  const hashToModules = new Map<string, DaoModuleName[]>();
  for (const name of configured) {
    const hash = wasmHashes[name];
    if (hash) hashToModules.set(hash, [...(hashToModules.get(hash) ?? []), name]);
  }
  const codeKeys = [...hashToModules.keys()].map((hash) => ({ hash, key: contractCodeKey(hash) }));

  // Artwork: the property headers and IPFS groups the metadata instance says exist.
  const metadataId = modules.metadata;
  const hasArtwork = Boolean(metadataId);
  const artworkReadable = hasArtwork && metadataStorage !== null && metadataInstanceLive !== null;
  const propertyCount = metadataStorage && artworkReadable ? countFrom(metadataStorage, 'PropertyCount') : 0;
  const ipfsGroupCount = metadataStorage && artworkReadable ? countFrom(metadataStorage, 'IpfsGroupCount') : 0;

  const propertyKeys = artworkReadable
    ? Array.from({ length: propertyCount }, (_, index) => ({ index, key: propertyKey(metadataId as string, index) }))
    : [];
  const groupKeys = artworkReadable
    ? Array.from({ length: ipfsGroupCount }, (_, index) => ({ index, key: ipfsGroupKey(metadataId as string, index) }))
    : [];

  // Batch 2: shared code, property headers and IPFS groups.
  const batch2Found = await fetchEntries(server, [
    ...codeKeys.map(({ key }) => key),
    ...propertyKeys.map(({ key }) => key),
    ...groupKeys.map(({ key }) => key)
  ]);

  const properties = propertyKeys.map(({ index, key }) => {
    const entry = batch2Found.get(key.toXDR('base64'));
    return {
      index,
      liveUntil: liveUntilOf(batch2Found, key),
      itemCount: entry ? itemCountFrom(entry) : 0
    };
  });

  // Batch 3: item entries, sized by the property headers that were read.
  const itemRequests = properties.flatMap((property) =>
    property.liveUntil === null
      ? []
      : Array.from({ length: property.itemCount }, (_, item) => ({
          property: property.index,
          item,
          key: itemKey(metadataId as string, property.index, item)
        }))
  );
  const itemFound = await fetchEntries(
    server,
    itemRequests.map((request) => request.key)
  );

  // Code section.
  const codeEntries: TtlEntry[] = [
    ...codeKeys.map(({ hash, key }) => ({
      label: `code ${(hashToModules.get(hash) ?? []).join('+')} (${hash.slice(0, 8)})`,
      liveUntilLedgerSeq: liveUntilOf(batch2Found, key)
    })),
    ...instanceMissing.map((name) => ({
      label: `code ${name} (instance missing, hash unknown)`,
      liveUntilLedgerSeq: null
    }))
  ];
  const codeSection = section(codeEntries, latestLedger, readAt);

  // Artwork section.
  let artwork: ArtworkTtlSection | null = null;
  if (hasArtwork) {
    if (!artworkReadable) {
      // The metadata instance is archived or absent, so the artwork cannot be enumerated.
      artwork = {
        ...section([{ label: 'metadata instance', liveUntilLedgerSeq: null }], latestLedger, readAt),
        propertyCount: 0,
        ipfsGroupCount: 0,
        itemCounts: [],
        totalEntries: 0
      };
    } else {
      const entries: TtlEntry[] = [{ label: 'metadata instance', liveUntilLedgerSeq: metadataInstanceLive }];
      for (const property of properties) {
        entries.push({ label: `Property(${property.index})`, liveUntilLedgerSeq: property.liveUntil });
      }
      for (const request of itemRequests) {
        entries.push({
          label: `Item(${request.property},${request.item})`,
          liveUntilLedgerSeq: liveUntilOf(itemFound, request.key)
        });
      }
      for (const { index, key } of groupKeys) {
        entries.push({ label: `IpfsGroup(${index})`, liveUntilLedgerSeq: liveUntilOf(batch2Found, key) });
      }

      const itemCounts = properties.map((property) => property.itemCount);
      artwork = {
        ...section(entries, latestLedger, readAt),
        propertyCount,
        ipfsGroupCount,
        itemCounts,
        totalEntries: artworkEntryTotal(itemCounts, ipfsGroupCount)
      };
    }
  }

  return {
    latestLedger,
    readAt,
    code: { ...codeSection, wasmHashes, unconfigured },
    artwork
  };
}
