import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ allowedWallets: { value: [] as unknown[] }, listAtOpen: [] as unknown[] }));

vi.mock('@creit.tech/stellar-wallets-kit/state', () => ({ allowedWallets: state.allowedWallets }));
vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({
  StellarWalletsKit: {
    authModal: vi.fn(async () => {
      state.listAtOpen = state.allowedWallets.value;
      return { address: 'GADDRESS' };
    })
  }
}));

import { openConnectModal } from './wallet-connect-modal';

// BUG-004 (docs/qa/BUG_LEDGER.md): a stale wallet list let a pick fire before the kit listened.
describe('openConnectModal', () => {
  beforeEach(() => {
    state.allowedWallets.value = [{ id: 'freighter', isAvailable: true }];
  });

  it('opens the modal with no cached wallet list, so it shows the loading state until the kit listens', async () => {
    await expect(openConnectModal()).resolves.toEqual({ address: 'GADDRESS' });
    expect(state.listAtOpen).toEqual([]);
  });
});
