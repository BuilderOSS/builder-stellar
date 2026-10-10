import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertMarketplaceTransaction,
  assertMarketplaceWallet,
  assertUnchangedMarketplaceEnvelope,
  confirmMarketplaceTransaction
} from './transaction';

afterEach(() => {
  vi.useRealTimers();
});
const signer = Keypair.random();
function transaction(value = 'expected') {
  return new TransactionBuilder(new Account(signer.publicKey(), '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(Operation.manageData({ name: 'offline fixture', value }))
    .setTimeout(180)
    .build();
}
describe('marketplace wallet and confirmation safety', () => {
  it('refuses account and network mismatch before requesting a signature', () => {
    expect(() =>
      assertMarketplaceWallet(signer.publicKey(), Networks.TESTNET, signer.publicKey(), Networks.TESTNET, 'Testnet')
    ).not.toThrow();
    expect(() =>
      assertMarketplaceWallet('other', Networks.TESTNET, signer.publicKey(), Networks.TESTNET, 'Testnet')
    ).toThrow('account changed');
    expect(() =>
      assertMarketplaceWallet(signer.publicKey(), Networks.PUBLIC, signer.publicKey(), Networks.TESTNET, 'Testnet')
    ).toThrow('Switch your wallet');
  });
  it('checks the server actor and rejects expired prepared envelopes', () => {
    const tx = transaction();
    expect(() => assertMarketplaceTransaction(tx, signer.publicKey())).not.toThrow();
    expect(() => assertMarketplaceTransaction(tx, 'other')).toThrow('source');
    expect(() => assertMarketplaceTransaction(tx, signer.publicKey(), Number(tx.timeBounds!.maxTime))).toThrow(
      'expired'
    );
  });
  it('permits a signature-only change but rejects repricing or changed operations', () => {
    const original = transaction();
    const signed = TransactionBuilder.fromXDR(original.toXDR(), Networks.TESTNET);
    // Offline fixture signing only. No wallet is called and no transaction is sent.
    signed.sign(signer);
    expect(assertUnchangedMarketplaceEnvelope(original, signed)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertUnchangedMarketplaceEnvelope(original, transaction('changed'))).toThrow('wallet changed');
  });
  it('never swallows an on-chain failure or reports it as pending/success', async () => {
    const getTransaction = vi.fn().mockResolvedValue({ status: 'FAILED' });
    await expect(confirmMarketplaceTransaction({ getTransaction }, 'hash')).rejects.toThrow('failed on-chain');
    expect(getTransaction).toHaveBeenCalledTimes(1);
  });
  it('waits through NOT_FOUND and only reports confirmed success', async () => {
    vi.useFakeTimers();
    const getTransaction = vi
      .fn()
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS' });
    const promise = confirmMarketplaceTransaction({ getTransaction }, 'hash', { interval: 10, timeout: 100 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(getTransaction).toHaveBeenCalledTimes(2);
  });
  it('times out with the original hash retained and a no-duplicate instruction', async () => {
    vi.useFakeTimers();
    const promise = confirmMarketplaceTransaction(
      { getTransaction: vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }) },
      'hash',
      { interval: 10, timeout: 20 }
    );
    const expectation = expect(promise).rejects.toThrow('do not submit a duplicate');
    await vi.advanceTimersByTimeAsync(20);
    await expectation;
  });
});
