import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ getTransaction: vi.fn() }));
vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: class {
    getTransaction = rpc.getTransaction;
  }
}));
import { waitForConfirmation } from './transaction-confirmation';

describe('transaction confirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpc.getTransaction.mockReset();
  });
  afterEach(() => vi.useRealTimers());
  it('surfaces terminal FAILED immediately, not as a later timeout', async () => {
    rpc.getTransaction.mockResolvedValue({ status: 'FAILED' });
    await expect(waitForConfirmation('hash', 'https://rpc.test')).rejects.toThrow('failed on-chain');
    expect(rpc.getTransaction).toHaveBeenCalledTimes(1);
  });
  it('retries transport errors/NOT_FOUND then returns a successful receipt', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc.getTransaction
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValue({ status: 'SUCCESS', txHash: 'hash', ledger: 20 });
    const result = waitForConfirmation('hash', 'http://localhost:8000/rpc', { pollInterval: 10 });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ status: 'SUCCESS', ledger: 20 });
  });
  it('times out only for unresolved transactions, and requires a hash', async () => {
    rpc.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    const result = expect(
      waitForConfirmation('hash', 'https://rpc.test', { timeout: 20, pollInterval: 10 })
    ).rejects.toThrow('timeout');
    await vi.runAllTimersAsync();
    await result;
    await expect(waitForConfirmation('', 'https://rpc.test')).rejects.toThrow('hash is required');
  });
});
