'use client';

import { Account, type Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';
import useSWR from 'swr';

import {
  buildDaoInventory,
  CLASS_LABELS,
  type DaoInventory,
  extendToLedgers,
  extendTransaction,
  instanceWasmHash,
  type InventoryKey,
  planBatches,
  type RenewalClass,
  restoreTransaction,
  rpcLedgerRead,
  rpcModuleRenewal,
  yearlyRentEstimate
} from '@/lib/chain-reads/renewal';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';

/** Used when the network's archival settings cannot be read (testnet, 2026-10-12). */
const FALLBACK_MAX_ENTRY_TTL = 3_110_400;

export type CodeHealth = {
  liveUntil: number | null;
  hashes: number;
  /** Code hashes the RPC did not return at all: evicted, so no call to that module works. */
  evicted: string[];
};

export type RenewalReport = {
  inventory: DaoInventory;
  maxEntryTtl: number;
  /** Shared contract code the modules run: renewed by the platform, shown for information. */
  code: CodeHealth;
};

/** The fields a storage report reads: the network and the tribe's contracts. */
export type RenewalReportConfig = Pick<
  DaoNetworkConfig,
  | 'rpcUrl'
  | 'passphrase'
  | 'tokenContractId'
  | 'metadataContractId'
  | 'treasuryContractId'
  | 'governorContractId'
  | 'auctionContractId'
  | 'marketplaceContractId'
  | 'claimsContractId'
>;

function server(config: Pick<DaoNetworkConfig, 'rpcUrl'>) {
  return new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
}

/** The network's maximum entry TTL (ledgers), or the testnet value when it cannot be read. */
export async function readMaxEntryTtl(rpc: Server): Promise<number> {
  try {
    const key = xdr.LedgerKey.configSetting(
      new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingStateArchival })
    );
    const response = await rpc.getLedgerEntries(key);
    const entry = response.entries[0]?.val;
    if (entry?.type === 'configSetting' && entry.configSetting.type === 'configSettingStateArchival')
      return entry.configSetting.stateArchivalSettings.maxEntryTtl;
  } catch {
    // fall through
  }
  return FALLBACK_MAX_ENTRY_TTL;
}

async function readCodeHealth(rpc: Server, inventory: DaoInventory): Promise<CodeHealth> {
  const hashes = new Set<string>();
  for (const key of inventory.present) {
    if (key.cls !== 'contracts' || key.val.type !== 'contractData') continue;
    const hash = instanceWasmHash(key.val.contractData.val);
    if (hash) hashes.add(hash);
  }
  if (!hashes.size) return { liveUntil: null, hashes: 0, evicted: [] };
  const list = [...hashes];
  const keys = list.map((hash) =>
    xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') }))
  );
  const response = await rpc.getLedgerEntries(...keys);
  const returned = new Set(response.entries.map((entry) => entry.key.toXDR('base64')));
  const evicted = list.filter((_, i) => !returned.has(keys[i]!.toXDR('base64')));
  const lives = response.entries.map((entry) => entry.liveUntilLedgerSeq ?? 0);
  return { liveUntil: lives.length ? Math.min(...lives) : null, hashes: hashes.size, evicted };
}

export async function loadRenewalReport(config: RenewalReportConfig): Promise<RenewalReport> {
  const rpc = server(config);
  const inventory = await buildDaoInventory(rpcLedgerRead(rpc), {
    manager: getDeploymentConfig().managerAddress,
    token: config.tokenContractId,
    nowSeconds: Math.floor(Date.now() / 1000),
    // Known from the deployment record: lets the tab restore evicted instances
    // (bootstrap) before anything can be read from chain.
    modules: [
      config.metadataContractId,
      config.treasuryContractId,
      config.governorContractId,
      config.auctionContractId,
      config.marketplaceContractId,
      config.claimsContractId
    ].filter((a): a is string => Boolean(a)),
    renewalKeys: rpcModuleRenewal(rpc, config.passphrase)
  });
  const [maxEntryTtl, code] = await Promise.all([
    readMaxEntryTtl(rpc),
    inventory.bootstrap ? Promise.resolve({ liveUntil: null, hashes: 0, evicted: [] }) : readCodeHealth(rpc, inventory)
  ]);
  return { inventory, maxEntryTtl, code };
}

export function useDaoRenewal(config: DaoNetworkConfig) {
  return useSWR(['dao-renewal', config.tokenContractId, config.rpcUrl], () => loadRenewalReport(config), {
    revalidateOnFocus: false
  });
}

export type RenewalQuote = {
  days: number;
  extendTo: number;
  /** Restore archived keys first (one transaction), then extend (usually one). */
  transactions: SweepTransaction[];
  totalFee: bigint;
  /** Each class priced on its own, for the breakdown; the sweep itself bundles them. */
  classFees: Array<{ cls: RenewalClass; label: string; fee: bigint }>;
  /** Keeping everything alive for a year at this quote's rate (stroops), when it can be inferred. */
  yearlyFee: bigint | null;
};

/**
 * The most one renewal transaction may carry in fees (stroops): the transaction fee is a u32, and a
 * large code entry extended for months comes close (scripts/lib.mjs `SAFE_RESOURCE_FEE_STROOPS`).
 */
export const MAX_SWEEP_TX_FEE = 3_000_000_000n;

export type SweepKey = { key: xdr.LedgerKey; bytes: number; liveUntil: number };
export type SweepTransaction = { kind: 'restore' | 'extend'; tx: Transaction; keys: number };

/**
 * Build and simulate a sweep over any keys: restore `missing` first, then extend `present` in
 * batches under the footprint, read-bytes and fee limits. A batch over the fee limit is split; a
 * single key over it means the period is too long for one step. Nothing is signed.
 */
export async function quoteSweep(input: {
  rpcUrl: string;
  passphrase: string;
  source: string;
  days: number;
  maxEntryTtl: number;
  latestLedger: number;
  present: SweepKey[];
  missing: xdr.LedgerKey[];
}) {
  const rpc = server(input);
  const extendTo = extendToLedgers(input.days, input.maxEntryTtl);
  const loaded = await rpc.getAccount(input.source);
  // One account object, so consecutive transactions get consecutive sequence numbers.
  const account = new Account(input.source, loaded.sequenceNumber());
  const transactions: SweepTransaction[] = [];
  if (input.missing.length) {
    const tx = await rpc.prepareTransaction(restoreTransaction(account, input.missing, input.passphrase));
    transactions.push({ kind: 'restore', tx, keys: input.missing.length });
  }
  const extend = async (batch: SweepKey[]): Promise<void> => {
    // Price on a throwaway sequence first, so a split never leaves a gap in the real sequence.
    const probe = await rpc.prepareTransaction(
      extendTransaction(
        new Account(input.source, account.sequenceNumber()),
        batch.map((k) => k.key),
        extendTo,
        input.passphrase
      )
    );
    if (BigInt(probe.fee) > MAX_SWEEP_TX_FEE) {
      if (batch.length === 1)
        throw new Error(
          `One entry would cost more than ${Number(MAX_SWEEP_TX_FEE / 10_000_000n)} XLM to renew for ${input.days} days in one transaction. Choose fewer days and renew again later.`
        );
      const half = Math.ceil(batch.length / 2);
      await extend(batch.slice(0, half));
      await extend(batch.slice(half));
      return;
    }
    const tx = await rpc.prepareTransaction(
      extendTransaction(
        account,
        batch.map((k) => k.key),
        extendTo,
        input.passphrase
      )
    );
    transactions.push({ kind: 'extend', tx, keys: batch.length });
  };
  for (const batch of planBatches(input.present)) await extend(batch);
  const extendFee = transactions.filter((t) => t.kind === 'extend').reduce((sum, { tx }) => sum + BigInt(tx.fee), 0n);
  return {
    days: input.days,
    extendTo,
    transactions,
    totalFee: transactions.reduce((sum, { tx }) => sum + BigInt(tx.fee), 0n),
    yearlyFee: yearlyRentEstimate({ present: input.present, latestLedger: input.latestLedger }, extendTo, extendFee)
  };
}

/** Build and simulate the sweep. Nothing is signed. */
export async function quoteRenewal(
  config: DaoNetworkConfig,
  report: RenewalReport,
  days: number,
  source: string
): Promise<RenewalQuote> {
  const rpc = server(config);
  const { present, missing } = report.inventory;
  const sweep = await quoteSweep({
    rpcUrl: config.rpcUrl,
    passphrase: config.passphrase,
    source,
    days,
    maxEntryTtl: report.maxEntryTtl,
    latestLedger: report.inventory.latestLedger,
    present,
    missing: missing.map((k: InventoryKey) => k.key)
  });
  // Per-class prices come from separate simulations on a throwaway sequence.
  const priced = new Account(source, (await rpc.getAccount(source)).sequenceNumber());
  const classes = [...new Set(present.map((k) => k.cls))];
  const classFees = await Promise.all(
    classes.map(async (cls) => {
      const keys = present.filter((k) => k.cls === cls).map((k) => k.key);
      const tx = await rpc.prepareTransaction(
        extendTransaction(new Account(source, priced.sequenceNumber()), keys, sweep.extendTo, config.passphrase)
      );
      return { cls, label: CLASS_LABELS[cls], fee: BigInt(tx.fee) };
    })
  );
  return { ...sweep, classFees };
}

/**
 * Sign and submit each transaction in order. Confirmed transactions stay
 * confirmed if a later one fails; the report is reloaded either way.
 */
export async function submitRenewal(
  config: Pick<DaoNetworkConfig, 'rpcUrl' | 'passphrase'>,
  quote: Pick<RenewalQuote, 'transactions'>,
  sign: (xdr: string) => Promise<string>,
  onProgress: (done: number, total: number) => void
) {
  const rpc = server(config);
  let done = 0;
  for (const { tx } of quote.transactions) {
    const signed = TransactionBuilder.fromXDR(await sign(tx.toXDR()), config.passphrase);
    const sent = await rpc.sendTransaction(signed);
    if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER')
      throw new Error(`The network did not accept transaction ${done + 1}. Nothing after it was sent.`);
    await waitForConfirmation(sent.hash, config.rpcUrl);
    done += 1;
    onProgress(done, quote.transactions.length);
  }
}
