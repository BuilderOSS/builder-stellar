import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sign: vi.fn(), send: vi.fn(), wait: vi.fn() }));
vi.mock('@/lib/wallet-sign', () => ({ signWithWallet: mocks.sign }));
vi.mock('@/lib/transaction-confirmation', () => ({ waitForConfirmation: mocks.wait }));
vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: class {
    sendTransaction = mocks.send;
  }
}));

import { withArchivedRestore } from './restore-archived-client';
import { RestoreRequiredError } from './restore-required';

const member = Keypair.random().publicKey();
const restoreXdr = new TransactionBuilder(new Account(member, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.restoreFootprint({}))
  .setTimeout(180)
  .build()
  .toXDR();
const context = { address: member, rpcUrl: 'https://rpc.test', networkPassphrase: Networks.TESTNET };

describe('withArchivedRestore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.sign.mockResolvedValue({ signedTxXdr: restoreXdr });
    mocks.send.mockResolvedValue({ status: 'PENDING', hash: 'abc' });
    mocks.wait.mockResolvedValue(undefined);
  });

  it('signs and sends the restore, then prepares again', async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new RestoreRequiredError({ xdr: restoreXdr, fee: '12445' }))
      .mockResolvedValueOnce('prepared');
    const steps: string[] = [];
    await expect(withArchivedRestore(prepare, { ...context, onRestoring: (m) => steps.push(m) })).resolves.toBe(
      'prepared'
    );
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenCalledWith(restoreXdr, { address: member, networkPassphrase: Networks.TESTNET });
    expect(mocks.wait).toHaveBeenCalledWith('abc', 'https://rpc.test');
    expect(steps[0]).toContain('0.0012 XLM');
  });

  it('passes other failures through and stops when the network refuses the restore', async () => {
    await expect(withArchivedRestore(() => Promise.reject(new Error('nope')), context)).rejects.toThrow('nope');
    mocks.send.mockResolvedValue({ status: 'ERROR', hash: 'abc' });
    const prepare = vi.fn().mockRejectedValue(new RestoreRequiredError({ xdr: restoreXdr, fee: '1' }));
    await expect(withArchivedRestore(prepare, context)).rejects.toThrow('did not accept the restore');
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
