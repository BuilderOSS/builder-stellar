import { beforeEach, describe, expect, it, vi } from 'vitest';

const kit = vi.hoisted(() => ({
  getAddress: vi.fn(async () => ({ address: 'GWALLET' })),
  getNetwork: vi.fn(async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' })),
  signTransaction: vi.fn()
}));
const walletConnect = vi.hoisted(() => ({ selected: false }));
const session = vi.hoisted(() => ({
  walletNetworkPassphrase: 'Test SDF Network ; September 2015',
  walletNetworkIssue: ''
}));

vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({ StellarWalletsKit: kit }));
vi.mock('@/lib/wallet-kit', () => ({ isWalletConnectSelected: () => walletConnect.selected }));
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => session } }));

import { errorMessage } from './transaction-feedback';
import { readSigningWallet } from './wallet-sign';

describe('readSigningWallet', () => {
  beforeEach(() => {
    walletConnect.selected = false;
    kit.getNetwork.mockClear();
  });

  it('asks extension wallets for their network', async () => {
    const [wallet, network] = await readSigningWallet();
    expect(wallet.address).toBe('GWALLET');
    expect(network.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(kit.getNetwork).toHaveBeenCalled();
  });

  it('never calls getNetwork for WalletConnect wallets (Freighter mobile), using the session network', async () => {
    walletConnect.selected = true;
    // The kit's WalletConnect module always rejects getNetwork.
    kit.getNetwork.mockRejectedValueOnce({
      code: -3,
      message: 'WalletConnect does not support the "getNetwork" function'
    });
    const [wallet, network] = await readSigningWallet();
    expect(wallet.address).toBe('GWALLET');
    expect(network.networkPassphrase).toBe(session.walletNetworkPassphrase);
    expect(kit.getNetwork).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('keeps the message from plain-object wallet errors', () => {
    expect(errorMessage({ code: -4, message: 'User declined' }, 'Failed')).toBe('User declined');
    expect(errorMessage(new Error('Boom'), 'Failed')).toBe('Boom');
    expect(errorMessage('Rejected', 'Failed')).toBe('Rejected');
    expect(errorMessage({ code: 1 }, 'Failed')).toBe('Failed');
  });
});
