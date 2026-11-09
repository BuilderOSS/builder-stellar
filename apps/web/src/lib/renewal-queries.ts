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
  MAX_SWEEP_TX_FEE,
  prepareExtendBatches,
  prepareRestoredExtend,
  readArchivalSettings,
  type RenewalClass,
  rentRate,
  restoredExtendEstimate,
  restoreTransaction,
  rpcLedgerRead,
  rpcModuleRenewal,
  sorobanWriteBytes,
  yearlyRentEstimate
} from '@/lib/chain-reads/renewal';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';

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
  return (await readArchivalSettings(rpc)).maxEntryTtl;
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
  /**
   * Restore archived keys first (one transaction), then extend (usually one), then extend what the
   * restore brought back (restored entries return with the network's minimum TTL).
   */
  transactions: SweepTransaction[];
  /** Simulated fees, plus the estimate for extending restored items. */
  totalFee: bigint;
  /** Each class priced on its own, for the breakdown; the sweep itself bundles them. */
  classFees: Array<{ cls: RenewalClass; label: string; fee: bigint }>;
  /** Keeping everything alive for a year at this quote's rate (stroops), when it can be inferred. */
  yearlyFee: bigint | null;
};

export { MAX_SWEEP_TX_FEE };

export type SweepKey = { key: xdr.LedgerKey; bytes: number; liveUntil: number };
export type SweepTransaction =
  | { kind: 'restore' | 'extend'; tx: Transaction; keys: number }
  | {
      /**
       * Extend what the restore brought back. Archived keys cannot be simulated until the restore
       * lands, so this step is priced by estimate and prepared once the restore confirms; it stops
       * for a new quote if it would cost more than `restoredExtendLimit(estimatedFee)`.
       */
      kind: 'extend-restored';
      source: string;
      restored: xdr.LedgerKey[];
      keys: number;
      days: number;
      extendTo: number;
      estimatedFee: bigint;
    };

/** The steps' fees: simulated where the step was simulated, estimated for restored items. */
export const sweepStepFee = (step: SweepTransaction) =>
  step.kind === 'extend-restored' ? step.estimatedFee : BigInt(step.tx.fee);

/** The restored-items step of a quote, if it has one. */
export const restoredStep = (transactions: SweepTransaction[]) =>
  transactions.find(
    (step): step is Extract<SweepTransaction, { kind: 'extend-restored' }> => step.kind === 'extend-restored'
  );

/**
 * Build and simulate a sweep over any keys: restore `missing` first, then extend `present` in
 * batches under the footprint, read-bytes and fee limits, then a last step that extends the
 * restored keys to the same period (priced by estimate, see `SweepTransaction`). Nothing is signed.
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
  let restore: Transaction | null = null;
  if (input.missing.length) {
    restore = await rpc.prepareTransaction(restoreTransaction(account, input.missing, input.passphrase));
    transactions.push({ kind: 'restore', tx: restore, keys: input.missing.length });
  }
  const extensions = await prepareExtendBatches({
    rpc,
    account,
    keys: input.present,
    extendTo,
    days: input.days,
    passphrase: input.passphrase
  });
  for (const { tx, keys } of extensions) transactions.push({ kind: 'extend', tx, keys });
  const extendFee = extensions.reduce((sum, { tx }) => sum + BigInt(tx.fee), 0n);
  const sweepRate = { present: input.present, latestLedger: input.latestLedger };
  if (restore) {
    const { minPersistentTtl } = await readArchivalSettings(rpc);
    const estimatedFee = restoredExtendEstimate({
      bytes: sorobanWriteBytes(restore),
      minPersistentTtl,
      extendTo,
      restoreFee: BigInt(restore.fee),
      rate: rentRate(sweepRate, extendTo, extendFee)
    });
    if (estimatedFee > 0n)
      transactions.push({
        kind: 'extend-restored',
        source: input.source,
        restored: input.missing,
        keys: input.missing.length,
        days: input.days,
        extendTo,
        estimatedFee
      });
  }
  return {
    days: input.days,
    extendTo,
    transactions,
    totalFee: transactions.reduce((sum, step) => sum + sweepStepFee(step), 0n),
    yearlyFee: yearlyRentEstimate(sweepRate, extendTo, extendFee)
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
 * Sign and submit each step in order. The restored-items step is prepared after the restore
 * confirms and signed the same way. Confirmed transactions stay confirmed if a later one fails;
 * the report is reloaded either way.
 */
export async function submitRenewal(
  config: Pick<DaoNetworkConfig, 'rpcUrl' | 'passphrase'>,
  quote: Pick<RenewalQuote, 'transactions'>,
  sign: (xdr: string) => Promise<string>,
  onProgress: (done: number, total: number) => void
) {
  const rpc = server(config);
  let done = 0;
  let sent = 0;
  const submit = async (tx: Transaction) => {
    const signed = TransactionBuilder.fromXDR(await sign(tx.toXDR()), config.passphrase);
    const result = await rpc.sendTransaction(signed);
    if (result.status === 'ERROR' || result.status === 'TRY_AGAIN_LATER')
      throw new Error(`The network did not accept transaction ${sent + 1}. Nothing after it was sent.`);
    await waitForConfirmation(result.hash, config.rpcUrl);
    sent += 1;
  };
  for (const step of quote.transactions) {
    if (step.kind === 'extend-restored') {
      const { transactions } = await prepareRestoredExtend({
        rpc,
        source: step.source,
        restored: step.restored,
        extendTo: step.extendTo,
        days: step.days,
        estimatedFee: step.estimatedFee,
        passphrase: config.passphrase
      });
      for (const tx of transactions) await submit(tx);
    } else await submit(step.tx);
    done += 1;
    onProgress(done, quote.transactions.length);
  }
}
