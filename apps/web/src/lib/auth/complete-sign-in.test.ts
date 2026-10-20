import type { KeyedMutator } from 'swr';
import { describe, expect, it, vi } from 'vitest';

import { completeSignIn } from './complete-sign-in';
import { restoredSessionAddress } from './restore-session';
import type { AuthSessionResponse } from './types';

describe('verified sign-in completion', () => {
  const verified: AuthSessionResponse = { authenticated: true, address: 'wallet', authMethod: 'sep53' };

  it('reconciles against the verified cache rather than an older anonymous session', async () => {
    let cached: AuthSessionResponse = { authenticated: false, address: null };
    let publish: () => void = () => {};
    const mutate = vi
      .fn()
      .mockImplementationOnce((session, options) => {
        expect(options).toEqual({ revalidate: false });
        return new Promise<void>((resolve) => {
          publish = () => {
            cached = session;
            resolve();
          };
        });
      })
      .mockResolvedValueOnce(verified);
    const authenticate = vi.fn(() => {
      expect(restoredSessionAddress(cached, 'wallet')).toBe('wallet');
    });
    const completion = completeSignIn(verified, mutate as KeyedMutator<AuthSessionResponse>, authenticate);
    expect(authenticate).not.toHaveBeenCalled();
    publish();
    await completion;
    expect(authenticate).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenNthCalledWith(2);
  });

  it('keeps successful authentication when the background session read fails', async () => {
    const mutate = vi.fn().mockResolvedValueOnce(verified).mockRejectedValueOnce(new Error('Session read failed'));
    const authenticate = vi.fn();
    await expect(completeSignIn(verified, mutate, authenticate)).resolves.toBeUndefined();
    expect(authenticate).toHaveBeenCalledOnce();
  });

  it('does not authenticate before the verified cache can be published', async () => {
    const mutate = vi.fn().mockRejectedValue(new Error('Cache publication failed'));
    const authenticate = vi.fn();
    await expect(completeSignIn(verified, mutate, authenticate)).rejects.toThrow('Cache publication failed');
    expect(authenticate).not.toHaveBeenCalled();
  });
});
