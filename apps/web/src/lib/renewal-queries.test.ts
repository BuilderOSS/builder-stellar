import {
  Address,
  Keypair,
  Networks,
  SorobanDataBuilder,
  type Transaction,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A small fake network: entries with a size and a live-until ledger, some archived. Simulation
 * prices rent linearly (RATE stroops per byte-ledger gained) and, like the real RPC, cannot
 * simulate an extension over an archived entry. Sending applies the operation.
 */
const RATE = 0.01;
const MIN_PERSISTENT_TTL = 120_960;
const LATEST = 1_000_000;

type FakeEntry = { bytes: number; liveUntil: number; archived: boolean };
const chain = vi.hoisted(() => ({ entries: new Map<string, FakeEntry>(), sequence: 10n }));
const wait = vi.hoisted(() => vi.fn());

const id = (key: xdr.LedgerKey) => key.toXDR('base64');

function sorobanData(tx: Transaction) {
  const envelope = tx.toEnvelope();
  if (envelope.type !== 'envelopeTypeTx' || envelope.v1.tx.ext.type !== 'sorobanData') throw new Error('no data');
  return envelope.v1.tx.ext.sorobanData;
}
const footprint = (tx: Transaction) => {
  const { footprint: fp } = sorobanData(tx).resources;
  return [...fp.readOnly, ...fp.readWrite];
};
const operation = (tx: Transaction) => tx.operations[0] as { type: string; extendTo?: number };

vi.mock('@/lib/transaction-confirmation', () => ({ waitForConfirmation: wait }));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: () => ({ managerAddress: '' }) }));
vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: class {
    async getAccount(address: string) {
      return { accountId: () => address, sequenceNumber: () => chain.sequence.toString() };
    }
    async getLedgerEntries(...keys: xdr.LedgerKey[]) {
      const entries = keys.flatMap((key): Array<{ key: xdr.LedgerKey; val: unknown; liveUntilLedgerSeq?: number }> => {
        if (key.type === 'configSetting')
          return [
            {
              key,
              val: {
                type: 'configSetting',
                configSetting: {
                  type: 'configSettingStateArchival',
                  stateArchivalSettings: { maxEntryTtl: 3_110_400, minPersistentTtl: MIN_PERSISTENT_TTL }
                }
              }
            }
          ];
        const entry = chain.entries.get(id(key));
        if (!entry || entry.archived) return [];
        const keyBytes = key.toXDR().length;
        return [
          { key, val: { toXDR: () => new Uint8Array(entry.bytes - keyBytes) }, liveUntilLedgerSeq: entry.liveUntil }
        ];
      });
      return { latestLedger: LATEST, entries };
    }
    async prepareTransaction(tx: Transaction) {
      const op = operation(tx);
      const keys = footprint(tx).map((key) => chain.entries.get(id(key))!);
      let fee = 0;
      let writeBytes = 0;
      if (op.type === 'restoreFootprint') {
        writeBytes = keys.reduce((sum, e) => sum + e.bytes, 0);
        // Rent for the minimum TTL plus a write fee per byte.
        fee = Math.ceil(writeBytes * MIN_PERSISTENT_TTL * RATE + writeBytes * 50);
      } else {
        if (keys.some((e) => e.archived)) throw new Error('entry is archived');
        const target = LATEST + op.extendTo!;
        fee = Math.ceil(keys.reduce((sum, e) => sum + e.bytes * Math.max(0, target - e.liveUntil), 0) * RATE);
      }
      const data = new SorobanDataBuilder(sorobanData(tx)).setResources(0, 0, writeBytes).setResourceFee(fee).build();
      return TransactionBuilder.cloneFrom(tx, { fee: '100', sorobanData: data }).build();
    }
    async sendTransaction(tx: Transaction) {
      const op = operation(tx);
      for (const key of footprint(tx)) {
        const entry = chain.entries.get(id(key))!;
        if (op.type === 'restoreFootprint') {
          entry.archived = false;
          entry.liveUntil = LATEST + MIN_PERSISTENT_TTL - 1;
        } else entry.liveUntil = Math.max(entry.liveUntil, LATEST + op.extendTo!);
      }
      chain.sequence += 1n;
      return { status: 'PENDING', hash: `hash-${chain.sequence}` };
    }
  }
}));

import { quoteSweep, restoredStep, submitRenewal } from './renewal-queries';

const contract = Address.contract(Keypair.random().rawPublicKey()).toString();
const key = (n: number) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contract).toScAddress(),
      key: xdr.ScVal.scvU32(n),
      durability: xdr.ContractDataDurability.persistent
    })
  );
const source = Keypair.random().publicKey();
const config = { rpcUrl: 'https://rpc.test', passphrase: Networks.TESTNET };
const DAYS = 120;
const EXTEND_TO = DAYS * 17_280;

function seed(present: number[], archived: number[]) {
  chain.entries.clear();
  chain.sequence = 10n;
  for (const n of present) chain.entries.set(id(key(n)), { bytes: 400, liveUntil: LATEST + 1_000, archived: false });
  for (const n of archived) chain.entries.set(id(key(n)), { bytes: 600, liveUntil: LATEST - 10, archived: true });
}

const sweepInput = (present: number[], archived: number[]) => ({
  ...config,
  source,
  days: DAYS,
  maxEntryTtl: 3_110_400,
  latestLedger: LATEST,
  present: present.map((n) => ({ key: key(n), bytes: 400, liveUntil: LATEST + 1_000 })),
  missing: archived.map(key)
});

describe('renewal sweep with archived items', () => {
  beforeEach(() => {
    wait.mockReset();
    wait.mockResolvedValue(undefined);
  });

  it('quotes a third step that extends restored items, priced at the sweep’s rate', async () => {
    seed([1, 2], [3]);
    const quote = await quoteSweep(sweepInput([1, 2], [3]));
    expect(quote.transactions.map((t) => t.kind)).toEqual(['restore', 'extend', 'extend-restored']);
    const step = restoredStep(quote.transactions)!;
    // 600 bytes gaining extendTo - minimum TTL ledgers at the fake RATE, plus the base fee.
    const expected = 600 * (EXTEND_TO - MIN_PERSISTENT_TTL) * RATE;
    expect(Number(step.estimatedFee)).toBeGreaterThanOrEqual(expected);
    expect(Number(step.estimatedFee)).toBeLessThan(expected * 1.05);
    const simulated = quote.transactions.reduce(
      (sum, t) => sum + (t.kind === 'extend-restored' ? 0n : BigInt(t.tx.fee)),
      0n
    );
    expect(quote.totalFee).toBe(simulated + step.estimatedFee);
  });

  it('extends restored items to the chosen period in the same run, signing every step', async () => {
    seed([1, 2], [3]);
    const quote = await quoteSweep(sweepInput([1, 2], [3]));
    const signed: string[] = [];
    const progress: Array<[number, number]> = [];
    await submitRenewal(
      config,
      quote,
      async (tx) => {
        signed.push(tx);
        return tx;
      },
      (done, total) => progress.push([done, total])
    );
    expect(signed).toHaveLength(3);
    for (const n of [1, 2, 3]) expect(chain.entries.get(id(key(n)))!.liveUntil).toBe(LATEST + EXTEND_TO);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);
  });

  it('prices restored items from the restore alone when nothing else is extended, erring high', async () => {
    seed([], [3]);
    const quote = await quoteSweep(sweepInput([], [3]));
    expect(quote.transactions.map((t) => t.kind)).toEqual(['restore', 'extend-restored']);
    const step = restoredStep(quote.transactions)!;
    expect(Number(step.estimatedFee)).toBeGreaterThan(600 * (EXTEND_TO - MIN_PERSISTENT_TTL) * RATE);
    await submitRenewal(
      config,
      quote,
      async (tx) => tx,
      () => {}
    );
    expect(chain.entries.get(id(key(3)))!.liveUntil).toBe(LATEST + EXTEND_TO);
  });

  it('stops before signing the last step when it would cost well over the quote', async () => {
    seed([1], [3]);
    const quote = await quoteSweep(sweepInput([1], [3]));
    const step = restoredStep(quote.transactions)!;
    step.estimatedFee = 1_000n;
    const sign = vi.fn(async (tx: string) => tx);
    await expect(submitRenewal(config, quote, sign, () => {})).rejects.toThrow('Get a new quote');
    expect(sign).toHaveBeenCalledTimes(2);
    expect(chain.entries.get(id(key(3)))!.liveUntil).toBe(LATEST + MIN_PERSISTENT_TTL - 1);
  });

  it('adds no third step when the period is shorter than what restored entries get anyway', async () => {
    seed([1], [3]);
    const quote = await quoteSweep({ ...sweepInput([1], [3]), days: 5 });
    expect(quote.transactions.map((t) => t.kind)).toEqual(['restore', 'extend']);
  });
});
