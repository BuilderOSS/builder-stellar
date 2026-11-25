import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const walletConnect = vi.hoisted(() => ({ selected: false }));
const kit = vi.hoisted(() => ({
  getAddress: vi.fn(async () => ({ address: 'GWALLET' })),
  getNetwork: vi.fn(async () => ({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' })),
  signTransaction: vi.fn(),
  get selectedModule() {
    return { productId: walletConnect.selected ? 'wallet_connect' : 'freighter' };
  }
}));
const session = vi.hoisted(() => ({
  walletNetworkPassphrase: 'Test SDF Network ; September 2015',
  walletNetworkIssue: ''
}));

vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({ StellarWalletsKit: kit }));
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => session } }));

import { FeeGuardError, UnreadableTransactionError } from '@/lib/fee/fee-guard';

import { errorMessage } from './transaction-feedback';
import { readSigningWallet, signSep10Challenge, signWithWallet } from './wallet-sign';

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

const server = Keypair.random();
const client = Keypair.random();
const DOMAIN = 'app.example.test';
const expected = {
  address: client.publicKey(),
  networkPassphrase: Networks.TESTNET,
  serverPublicKey: server.publicKey()
};

function challenge(overrides: { server?: Keypair; address?: string; passphrase?: string } = {}) {
  return {
    xdr: WebAuth.buildChallengeTx(
      overrides.server ?? server,
      overrides.address ?? client.publicKey(),
      DOMAIN,
      300,
      overrides.passphrase ?? Networks.TESTNET,
      DOMAIN
    ),
    homeDomain: DOMAIN,
    webAuthDomain: DOMAIN
  };
}

/** A challenge-shaped transaction (manageData only) with a real sequence number, signed by the server. */
function serverSignedSequencedChallenge() {
  const tx = new TransactionBuilder(new Account(server.publicKey(), '41'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(Operation.manageData({ name: `${DOMAIN} auth`, value: 'x'.repeat(64), source: client.publicKey() }))
    .addOperation(Operation.manageData({ name: 'web_auth_domain', value: DOMAIN, source: server.publicKey() }))
    .setTimeout(300)
    .build();
  tx.sign(server);
  return tx.toXDR();
}

/** A real payment, signed by the server key, offered in place of a sign-in challenge. */
function serverSignedPayment(fee = '100') {
  const tx = new TransactionBuilder(new Account(client.publicKey(), '41'), { fee, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: server.publicKey(), asset: Asset.native(), amount: '1000' }))
    .setTimeout(300)
    .build();
  tx.sign(server);
  return tx.toXDR();
}

describe('signWithWallet fee guard', () => {
  beforeEach(() => {
    session.walletNetworkIssue = '';
    kit.signTransaction.mockReset().mockResolvedValue({ signedTxXdr: 'signed', signerAddress: client.publicKey() });
  });

  it('refuses XDR it cannot read instead of passing it to the wallet', async () => {
    await expect(signWithWallet('not xdr', { networkPassphrase: Networks.TESTNET })).rejects.toBeInstanceOf(
      UnreadableTransactionError
    );
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });

  it('refuses a fee above the guard and signs an ordinary one', async () => {
    await expect(
      signWithWallet(serverSignedPayment('600000000'), { networkPassphrase: Networks.TESTNET })
    ).rejects.toBeInstanceOf(FeeGuardError);
    expect(kit.signTransaction).not.toHaveBeenCalled();
    await signWithWallet(serverSignedPayment(), { networkPassphrase: Networks.TESTNET });
    expect(kit.signTransaction).toHaveBeenCalledOnce();
  });
});

describe('signSep10Challenge', () => {
  beforeEach(() => {
    kit.signTransaction.mockReset().mockResolvedValue({ signedTxXdr: 'signed', signerAddress: client.publicKey() });
  });
  afterEach(() => vi.useRealTimers());

  it('passes a genuine challenge for this address and network to the wallet', async () => {
    const valid = challenge();
    await signSep10Challenge(valid, expected);
    expect(kit.signTransaction).toHaveBeenCalledWith(valid.xdr, {
      networkPassphrase: Networks.TESTNET,
      address: client.publicKey()
    });
  });

  it('accepts a genuine challenge when the browser clock is an hour off', async () => {
    const valid = challenge();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    await signSep10Challenge(valid, expected);
    expect(kit.signTransaction).toHaveBeenCalledOnce();
  });

  it.each([
    ['a server-signed payment', () => ({ xdr: serverSignedPayment(), homeDomain: DOMAIN, webAuthDomain: DOMAIN })],
    [
      'a challenge-shaped transaction with a real sequence number',
      () => ({ xdr: serverSignedSequencedChallenge(), homeDomain: DOMAIN, webAuthDomain: DOMAIN })
    ],
    ['a challenge with another web auth domain', () => ({ ...challenge(), webAuthDomain: 'other.example.test' })],
    ['a challenge for another address', () => challenge({ address: Keypair.random().publicKey() })],
    ['a challenge from another server key', () => challenge({ server: Keypair.random() })],
    ['a challenge for another network', () => challenge({ passphrase: Networks.PUBLIC })],
    ['a challenge for other domains', () => ({ ...challenge(), homeDomain: 'other.example.test' })],
    ['unreadable XDR', () => ({ xdr: 'not xdr', homeDomain: DOMAIN, webAuthDomain: DOMAIN })]
  ])('refuses %s before the wallet sees it', async (_label, build) => {
    await expect(signSep10Challenge(build(), expected)).rejects.toThrow('nothing was signed');
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });
});

describe('wallet signing entry points', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  it('signs every transaction through wallet-sign.ts, so each one passes its guards', () => {
    const root = join(__dirname, '..');
    const direct = sources(root).filter(
      (path) =>
        !path.endsWith(join('lib', 'wallet-sign.ts')) && readFileSync(path, 'utf8').includes('.signTransaction(')
    );
    expect(direct.map((path) => path.slice(root.length + 1))).toEqual([]);
  });
});
