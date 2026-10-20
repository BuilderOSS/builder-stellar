import { describe, expect, it } from 'vitest';

import { restoredSessionAddress } from './restore-session';

describe('restoring a session after refresh', () => {
  const valid = { authenticated: true, address: 'wallet-a' };
  it('restores a verified server session while the wallet extension is still unavailable', () => {
    expect(restoredSessionAddress(valid, undefined)).toBe('wallet-a');
    expect(restoredSessionAddress(valid, 'wallet-a')).toBe('wallet-a');
  });
  it('clears on a confirmed disconnect, a changed account, or an expired server session', () => {
    expect(restoredSessionAddress(valid, null)).toBeNull();
    expect(restoredSessionAddress(valid, 'wallet-b')).toBeNull();
    expect(restoredSessionAddress({ authenticated: false, address: null }, 'wallet-a')).toBeNull();
  });
  it('waits for the server rather than inferring authentication from a wallet address', () => {
    expect(restoredSessionAddress(undefined, 'wallet-a')).toBeUndefined();
  });
});
