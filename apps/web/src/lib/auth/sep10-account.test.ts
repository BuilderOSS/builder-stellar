import { Keypair, NetworkError, NotFoundError, Transaction, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getNetworkConfig, type NetworkName } from '@/config/networks';

const mocks = vi.hoisted(() => ({ server: vi.fn(), loadAccount: vi.fn() }));
vi.mock('@stellar/stellar-sdk', async (original) => {
  const sdk = await original<typeof import('@stellar/stellar-sdk')>();
  return {
    ...sdk,
    Horizon: {
      ...sdk.Horizon,
      Server: class {
        constructor(url: string, options: unknown) {
          mocks.server(url, options);
        }
        loadAccount = mocks.loadAccount;
      }
    }
  };
});

import { SEP10_UNFUNDED_AUTH_POLICY, sep10HorizonUrl, verifySep10AccountProof } from './sep10-account';

function fixture(networkName: NetworkName = 'testnet') {
  const account = Keypair.random();
  const server = Keypair.random();
  const network = getNetworkConfig(networkName);
  const challenge = WebAuth.buildChallengeTx(
    server,
    account.publicKey(),
    'example.test',
    300,
    network.networkPassphrase,
    'example.test'
  );
  const sign = (...signers: Keypair[]) => {
    const tx = TransactionBuilder.fromXDR(challenge, network.networkPassphrase) as Transaction;
    tx.sign(...signers);
    return tx.toXDR();
  };
  const proof = (signedTxXdr: string) => ({
    signedTxXdr,
    serverAddress: server.publicKey(),
    accountAddress: account.publicKey(),
    network,
    homeDomain: 'example.test',
    webAuthDomain: 'example.test'
  });
  return { account, server, network, sign, proof };
}

describe('SEP-10 account-authority and canonical Horizon policy', () => {
  beforeEach(() => {
    mocks.server.mockClear();
    mocks.loadAccount.mockReset();
  });
  it.each([
    ['testnet', 'https://horizon-testnet.stellar.org', false],
    ['public', 'https://horizon.stellar.org', false],
    ['local', 'http://localhost:8000', true]
  ] as const)('uses canonical %s network/passphrase and Horizon only', async (name, url, allowHttp) => {
    const f = fixture(name);
    mocks.loadAccount.mockResolvedValue({
      account_id: f.account.publicKey(),
      thresholds: { med_threshold: 1 },
      signers: [{ key: f.account.publicKey(), type: 'ed25519_public_key', weight: 1 }]
    });
    expect(sep10HorizonUrl(f.network)).toBe(url);
    expect(await verifySep10AccountProof(f.proof(f.sign(f.account)))).toBe('existing-account');
    expect(mocks.server).toHaveBeenCalledWith(url, { allowHttp });
    expect(mocks.loadAccount).toHaveBeenCalledWith(f.account.publicKey());
  });
  it('rejects mismatched/unknown networks before constructing an account client', async () => {
    const f = fixture();
    await expect(
      verifySep10AccountProof({
        ...f.proof(f.sign(f.account)),
        network: { name: 'public', networkPassphrase: f.network.networkPassphrase }
      })
    ).rejects.toThrow(/canonical/);
    expect(() =>
      sep10HorizonUrl({
        name: 'http://attacker.invalid' as NetworkName,
        networkPassphrase: f.network.networkPassphrase
      })
    ).toThrow(/Unknown network/);
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.loadAccount).not.toHaveBeenCalled();
  });
  it('counts current alternative signer weights, not the master address or duplicate signatures', async () => {
    const f = fixture();
    const alternative = Keypair.random();
    mocks.loadAccount.mockResolvedValue({
      account_id: f.account.publicKey(),
      thresholds: { med_threshold: 2 },
      signers: [
        { key: f.account.publicKey(), type: 'ed25519_public_key', weight: 0 },
        { key: alternative.publicKey(), type: 'ed25519_public_key', weight: 2 }
      ]
    });
    await expect(verifySep10AccountProof(f.proof(f.sign(f.account)))).rejects.toThrow(/threshold/);
    expect(await verifySep10AccountProof(f.proof(f.sign(alternative)))).toBe('existing-account');
    await expect(verifySep10AccountProof(f.proof(f.sign(alternative, alternative)))).rejects.toThrow(/threshold/);
    // Authority is read again on every proof: a removed signer is not cached.
    mocks.loadAccount.mockResolvedValue({
      account_id: f.account.publicKey(),
      thresholds: { med_threshold: 1 },
      signers: [{ key: f.account.publicKey(), type: 'ed25519_public_key', weight: 0 }]
    });
    await expect(verifySep10AccountProof(f.proof(f.sign(alternative)))).rejects.toThrow(/threshold/);
    expect(mocks.loadAccount).toHaveBeenCalledTimes(4);
  });
  it('requires positive verified weight even when all transaction thresholds are zero', async () => {
    const f = fixture();
    mocks.loadAccount.mockResolvedValue({
      account_id: f.account.publicKey(),
      thresholds: { med_threshold: 0 },
      signers: [{ key: f.account.publicKey(), type: 'ed25519_public_key', weight: 0 }]
    });
    await expect(verifySep10AccountProof(f.proof(f.sign(f.account)))).rejects.toThrow(/threshold/);
  });
  it('does not count the authentication server signature as client-account weight', async () => {
    const f = fixture();
    mocks.loadAccount.mockResolvedValue({
      account_id: f.account.publicKey(),
      thresholds: { med_threshold: 2 },
      signers: [
        { key: f.account.publicKey(), type: 'ed25519_public_key', weight: 1 },
        { key: f.server.publicKey(), type: 'ed25519_public_key', weight: 255 }
      ]
    });
    await expect(verifySep10AccountProof(f.proof(f.sign(f.account)))).rejects.toThrow(/threshold/);
  });
  it('rejects malformed thresholds, duplicate signers and key/type mismatches', async () => {
    const f = fixture();
    const signer = { key: f.account.publicKey(), type: 'ed25519_public_key', weight: 1 };
    for (const record of [
      { thresholds: { med_threshold: -1 }, signers: [signer] },
      { thresholds: { med_threshold: '1' }, signers: [signer] },
      { thresholds: { med_threshold: 1 }, signers: [signer, signer] },
      { thresholds: { med_threshold: 1 }, signers: [{ ...signer, type: 'sha256_hash' }] },
      { thresholds: { med_threshold: 1 }, signers: [{ ...signer, weight: 256 }] }
    ]) {
      mocks.loadAccount.mockResolvedValue({ account_id: f.account.publicKey(), ...record });
      await expect(verifySep10AccountProof(f.proof(f.sign(f.account)))).rejects.toThrow(/Invalid/);
    }
  });
  it('uses the explicit unfunded policy only for a real Horizon NotFoundError with 404', async () => {
    const f = fixture();
    expect(SEP10_UNFUNDED_AUTH_POLICY).toBe('canonical-horizon-404-master-key-only');
    for (const error of [
      new Error('unavailable'),
      new NetworkError('Unavailable', { status: 503 }),
      new NetworkError('Not a canonical not-found error', { status: 404 }),
      new NotFoundError('Bad status', { status: 500 }),
      new NotFoundError('Proxy or RPC-only endpoint', { status: 404 })
    ]) {
      mocks.loadAccount.mockRejectedValue(error);
      await expect(verifySep10AccountProof(f.proof(f.sign(f.account)))).rejects.toThrow(/could not be read/);
    }
    mocks.loadAccount.mockRejectedValue(
      new NotFoundError('Account not found', { status: 404, type: 'https://stellar.org/horizon-errors/not_found' })
    );
    expect(await verifySep10AccountProof(f.proof(f.sign(f.account)))).toBe('unfunded-key');
    await expect(verifySep10AccountProof(f.proof(f.sign(Keypair.random())))).rejects.toThrow(/master-key/);
  });
});
