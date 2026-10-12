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
  yearlyRentEstimate
} from '@/lib/chain-reads/renewal';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { waitForConfirmation } from '@/lib/transaction-confirmation';

/** Used when the network's archival settings cannot be read (testnet, 2026-10-12). */
const FALLBACK_MAX_ENTRY_TTL = 3_110_400;

export type CodeHealth = { liveUntil: number | null; hashes: number };

export type RenewalReport = {
  inventory: DaoInventory;
  maxEntryTtl: number;
  /** Shared contract code the modules run: renewed by the platform, shown for information. */
  code: CodeHealth;
};

function server(config: DaoNetworkConfig) {
  return new Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
}

async function readMaxEntryTtl(rpc: Server): Promise<number> {
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
  if (!hashes.size) return { liveUntil: null, hashes: 0 };
  const keys = [...hashes].map((hash) =>
    xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') }))
  );
  const response = await rpc.getLedgerEntries(...keys);
  const lives = response.entries.map((entry) => entry.liveUntilLedgerSeq ?? 0);
  return { liveUntil: lives.length === keys.length ? Math.min(...lives) : null, hashes: hashes.size };
}

export async function loadRenewalReport(config: DaoNetworkConfig): Promise<RenewalReport> {
  const rpc = server(config);
  const inventory = await buildDaoInventory(rpcLedgerRead(rpc), {
    manager: getDeploymentConfig().managerAddress,
    token: config.tokenContractId,
    nowSeconds: Math.floor(Date.now() / 1000)
  });
  const [maxEntryTtl, code] = await Promise.all([readMaxEntryTtl(rpc), readCodeHealth(rpc, inventory)]);
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
  transactions: Array<{ kind: 'restore' | 'extend'; tx: Transaction; keys: number }>;
  totalFee: bigint;
  /** Each class priced on its own, for the breakdown; the sweep itself bundles them. */
  classFees: Array<{ cls: RenewalClass; label: string; fee: bigint }>;
  /** Keeping everything alive for a year at this quote's rate (stroops), when it can be inferred. */
  yearlyFee: bigint | null;
};

/** Build and simulate the sweep. Nothing is signed. */
export async function quoteRenewal(
  config: DaoNetworkConfig,
  report: RenewalReport,
  days: number,
  source: string
): Promise<RenewalQuote> {
  const rpc = server(config);
  const extendTo = extendToLedgers(days, report.maxEntryTtl);
  const loaded = await rpc.getAccount(source);
  // One account object, so consecutive transactions get consecutive sequence numbers.
  const account = new Account(source, loaded.sequenceNumber());
  const transactions: RenewalQuote['transactions'] = [];
  const { present, missing } = report.inventory;
  if (missing.length) {
    const tx = await rpc.prepareTransaction(
      restoreTransaction(
        account,
        missing.map((k: InventoryKey) => k.key),
        config.passphrase
      )
    );
    transactions.push({ kind: 'restore', tx, keys: missing.length });
  }
  for (const batch of planBatches(present)) {
    const tx = await rpc.prepareTransaction(
      extendTransaction(
        account,
        batch.map((k) => k.key),
        extendTo,
        config.passphrase
      )
    );
    transactions.push({ kind: 'extend', tx, keys: batch.length });
  }
  // Per-class prices come from separate simulations on a throwaway sequence.
  const priced = new Account(source, loaded.sequenceNumber());
  const classes = [...new Set(present.map((k) => k.cls))];
  const classFees = await Promise.all(
    classes.map(async (cls) => {
      const keys = present.filter((k) => k.cls === cls).map((k) => k.key);
      const tx = await rpc.prepareTransaction(
        extendTransaction(new Account(source, priced.sequenceNumber()), keys, extendTo, config.passphrase)
      );
      return { cls, label: CLASS_LABELS[cls], fee: BigInt(tx.fee) };
    })
  );
  return {
    days,
    extendTo,
    transactions,
    totalFee: transactions.reduce((sum, { tx }) => sum + BigInt(tx.fee), 0n),
    classFees,
    yearlyFee: yearlyRentEstimate(
      report.inventory,
      extendTo,
      transactions.filter((t) => t.kind === 'extend').reduce((sum, { tx }) => sum + BigInt(tx.fee), 0n)
    )
  };
}

/**
 * Sign and submit each transaction in order. Confirmed transactions stay
 * confirmed if a later one fails; the report is reloaded either way.
 */
export async function submitRenewal(
  config: DaoNetworkConfig,
  quote: RenewalQuote,
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
