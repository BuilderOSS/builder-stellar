import { Keypair } from '@stellar/stellar-sdk';
import { Err } from '@stellar/stellar-sdk/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  currentTokenHolder,
  holderBalance,
  holderDelegate,
  holderVotes,
  readHolderValue,
  requireHolderAddress
} from './read';
import { missingTokenRead } from './read-test-fixtures';

describe('token holder decoded read boundaries', () => {
  it('rejects the real SDK recognized error before its result getter can normalize it to Err', async () => {
    const tx = await missingTokenRead();
    expect(tx.result).toBeInstanceOf(Err);
    const result = vi.spyOn(tx, 'result', 'get');
    expect(() => readHolderValue(tx, requireHolderAddress)).toThrow('simulation failed');
    expect(result).not.toHaveBeenCalled();
  });
  it('rejects the same fulfilled error read in the pre-wallet ownership helper', async () => {
    const owner_of = vi.fn().mockResolvedValue(await missingTokenRead());
    await expect(currentTokenHolder({ owner_of }, 0)).rejects.toThrow('simulation failed');
    expect(owner_of).toHaveBeenCalledWith({ token_id: 0 });
  });
  it('does not accept a valid-looking result without a successful simulation gate', () => {
    const result = Keypair.random().publicKey();
    expect(() => readHolderValue({ simulationData: undefined, result }, requireHolderAddress)).toThrow('simulation');
    expect(() =>
      readHolderValue(
        {
          get simulationData() {
            throw new Error('Restore required.');
          },
          result
        },
        requireHolderAddress
      )
    ).toThrow('Restore required');
  });
  it('checks primitive balance, exact u128 voting power and nullable delegate types', () => {
    expect(holderBalance(0)).toBe(0);
    expect(holderVotes(9007199254740993n)).toBe(9007199254740993n);
    expect(holderDelegate(null)).toBeNull();
    const account = Keypair.random().publicKey();
    expect(holderDelegate(account)).toBe(account);
    const error = new Err({ message: 'NonExistentToken' });
    for (const decode of [holderBalance, holderVotes, holderDelegate, requireHolderAddress]) {
      expect(() => decode(error)).toThrow();
    }
    expect(() => holderBalance(-1)).toThrow();
    expect(() => holderBalance(4294967296)).toThrow();
    expect(() => holderVotes(1)).toThrow();
    expect(() => holderVotes(1n << 128n)).toThrow();
    expect(() => holderDelegate(undefined)).toThrow();
  });
});
