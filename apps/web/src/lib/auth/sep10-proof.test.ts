import { Keypair, Networks, NotFoundError, Transaction, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from './types';
const mocks = vi.hoisted(() => ({
  session: {} as AuthSession & { save: ReturnType<typeof vi.fn> },
  server: undefined as Keypair | undefined,
  rateLimit: vi.fn(),
  horizon: vi.fn(),
  loadAccount: vi.fn(),
  network: { name: 'testnet', networkPassphrase: 'Test SDF Network ; September 2015' }
}));
vi.mock('@stellar/stellar-sdk', async (original) => {
  const sdk = await original<typeof import('@stellar/stellar-sdk')>();
  return {
    ...sdk,
    Horizon: {
      ...sdk.Horizon,
      Server: class {
        constructor(url: string, options: unknown) {
          mocks.horizon(url, options);
        }
        loadAccount = mocks.loadAccount;
      }
    }
  };
});
vi.mock('@/lib/auth/server', async (original) => ({
  ...(await original<typeof import('./server')>()),
  getAuthSession: async () => mocks.session,
  getConfiguredNetwork: () => mocks.network,
  getSep10ServerKeypair: () => mocks.server!
}));
vi.mock('@/lib/auth/rate-limit', () => ({ enforceAuthRateLimit: mocks.rateLimit }));

import { POST } from '@/app/api/auth/sep10/verify/route';

import { matchesSep10Transaction } from './sep10-proof';

let client: Keypair;
let challenge: string;
function sign(xdr: string, ...keys: Keypair[]) {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  tx.sign(...(keys.length ? keys : [client]));
  return tx.toXDR();
}
function request(xdr: string, extra: Record<string, string> = {}) {
  return new Request('https://example.test/api/auth/sep10/verify', {
    method: 'POST',
    body: JSON.stringify({ signedTxXdr: xdr, ...extra })
  });
}

describe('SEP-10 exact body plus signer verification', () => {
  beforeEach(() => {
    mocks.server = Keypair.random();
    client = Keypair.random();
    challenge = WebAuth.buildChallengeTx(
      mocks.server,
      client.publicKey(),
      'example.test',
      300,
      Networks.TESTNET,
      'example.test'
    );
    mocks.session = {
      challenge: {
        method: 'sep10',
        address: client.publicKey(),
        xdr: challenge,
        network: 'testnet',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        homeDomain: 'example.test',
        webAuthDomain: 'example.test'
      },
      save: vi.fn()
    };
    mocks.rateLimit.mockReset().mockReturnValue(null);
    mocks.horizon.mockClear();
    mocks.loadAccount.mockReset().mockResolvedValue({
      account_id: client.publicKey(),
      thresholds: { low_threshold: 0, med_threshold: 1, high_threshold: 1 },
      signers: [{ key: client.publicKey(), weight: 1, type: 'ed25519_public_key' }]
    });
  });
  it('accepts a signed envelope with the same transaction body but different envelope XDR', async () => {
    const signed = sign(challenge);
    expect(signed).not.toBe(challenge);
    expect(matchesSep10Transaction(challenge, signed, Networks.TESTNET)).toBe(true);
    const response = await POST(request(signed, { address: Keypair.random().publicKey() }));
    expect(response.status).toBe(200);
    expect(mocks.session.address).toBe(client.publicKey());
    expect(mocks.session.challenge).toBeUndefined();
    expect(mocks.session.save).toHaveBeenCalledOnce();
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(Request), 'sep10-verify', 10);
  });
  it('rejects a different server-signed transaction even for the same client/domains', async () => {
    const other = WebAuth.buildChallengeTx(
      mocks.server!,
      client.publicKey(),
      'example.test',
      300,
      Networks.TESTNET,
      'example.test'
    );
    expect(matchesSep10Transaction(challenge, sign(other), Networks.TESTNET)).toBe(false);
    const response = await POST(request(sign(other)));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('INVALID_MESSAGE');
    expect(mocks.session.save).not.toHaveBeenCalled();
    expect(mocks.loadAccount).not.toHaveBeenCalled();
  });
  it('rejects missing/client-wrong signatures despite identical body hashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(request(challenge))).status).toBe(422);
    expect((await POST(request(sign(challenge, Keypair.random())))).status).toBe(422);
    expect(mocks.session.save).not.toHaveBeenCalled();
    // Failed verification releases the claim so the correct proof can still succeed.
    expect((await POST(request(sign(challenge)))).status).toBe(200);
  });
  it('preserves consumption, expiry, and deployment network checks', async () => {
    const oldChallenge = mocks.session.challenge;
    const signed = sign(challenge);
    expect((await POST(request(signed))).status).toBe(200);
    mocks.session.challenge = oldChallenge;
    expect((await POST(request(signed))).status).toBe(422);
    mocks.session.challenge = {
      ...oldChallenge!,
      expiresAt: new Date(Date.now() - 1).toISOString()
    } as AuthSession['challenge'];
    expect((await (await POST(request(signed))).json()).code).toBe('CHALLENGE_EXPIRED');
    mocks.session.challenge = { ...oldChallenge!, network: 'public' } as AuthSession['challenge'];
    // Use an unconsumed challenge to test the network guard.
    const nextXdr = WebAuth.buildChallengeTx(
      mocks.server!,
      client.publicKey(),
      'example.test',
      300,
      Networks.TESTNET,
      'example.test'
    );
    mocks.session.challenge = {
      ...oldChallenge!,
      method: 'sep10',
      xdr: nextXdr,
      network: 'public'
    } as AuthSession['challenge'];
    expect((await (await POST(request(sign(nextXdr)))).json()).code).toBe('NETWORK_MISMATCH');
  });
  it('does not verify or save when rate limited, and rejects malformed XDR', async () => {
    mocks.rateLimit.mockReturnValue(new Response('', { status: 429 }));
    expect((await POST(request(sign(challenge)))).status).toBe(429);
    expect(mocks.session.save).not.toHaveBeenCalled();
    expect(mocks.loadAccount).not.toHaveBeenCalled();
    expect(matchesSep10Transaction(challenge, 'bad xdr', Networks.TESTNET)).toBe(false);
  });

  it('rejects a disabled master even when the account medium threshold is zero', async () => {
    const alternative = Keypair.random();
    for (const med_threshold of [0, 1]) {
      mocks.loadAccount.mockResolvedValue({
        account_id: client.publicKey(),
        thresholds: { med_threshold },
        signers: [
          { key: client.publicKey(), weight: 0, type: 'ed25519_public_key' },
          { key: alternative.publicKey(), weight: 1, type: 'ed25519_public_key' }
        ]
      });
      const response = await POST(request(sign(challenge)));
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe('INVALID_SIGNATURE');
      expect(mocks.session.save).not.toHaveBeenCalled();
    }
    expect((await POST(request(sign(challenge, alternative)))).status).toBe(200);
    expect(mocks.session.address).toBe(client.publicKey());
  });

  it('accepts alternative/multiple current signers only when their weight meets the medium threshold', async () => {
    const first = Keypair.random();
    const second = Keypair.random();
    mocks.loadAccount.mockResolvedValue({
      account_id: client.publicKey(),
      thresholds: { low_threshold: 1, med_threshold: 2, high_threshold: 3 },
      signers: [
        { key: client.publicKey(), weight: 0, type: 'ed25519_public_key' },
        { key: first.publicKey(), weight: 1, type: 'ed25519_public_key' },
        { key: second.publicKey(), weight: 1, type: 'ed25519_public_key' }
      ]
    });
    expect(
      (
        await POST(
          request(sign(challenge, first), {
            threshold: '0',
            signers: JSON.stringify([{ key: first.publicKey(), weight: 255 }])
          })
        )
      ).status
    ).toBe(422);
    expect(mocks.session.save).not.toHaveBeenCalled();
    expect((await POST(request(sign(challenge, first, second)))).status).toBe(200);
    expect(mocks.session.address).toBe(client.publicKey());
    expect(mocks.loadAccount).toHaveBeenCalledWith(client.publicKey());
  });

  it('ignores supplied URLs/network/signers and uses only canonical deployment Horizon', async () => {
    const response = await POST(
      request(sign(challenge), {
        horizonUrl: 'http://attacker.invalid',
        rpcUrl: 'http://attacker.invalid',
        network: 'public',
        address: Keypair.random().publicKey()
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.horizon).toHaveBeenCalledWith('https://horizon-testnet.stellar.org', { allowHttp: false });
    expect(mocks.loadAccount).toHaveBeenCalledWith(client.publicKey());
  });

  it('preserves unfunded master-key authentication only on confirmed Horizon 404; outages never fall back', async () => {
    mocks.loadAccount.mockRejectedValue(new Error('Horizon unavailable'));
    const unavailable = await POST(request(sign(challenge)));
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).code).toBe('ACCOUNT_LOOKUP_UNAVAILABLE');
    expect(mocks.session.save).not.toHaveBeenCalled();
    mocks.loadAccount.mockRejectedValue(
      new NotFoundError('Account not found', { status: 404, type: 'https://stellar.org/horizon-errors/not_found' })
    );
    expect((await POST(request(sign(challenge, Keypair.random())))).status).toBe(422);
    expect((await POST(request(sign(challenge)))).status).toBe(200);
  });

  it('rejects malformed/current-account-mismatched data without falling back to the master', async () => {
    mocks.loadAccount.mockResolvedValue({
      account_id: Keypair.random().publicKey(),
      thresholds: { med_threshold: 1 },
      signers: [{ key: client.publicKey(), weight: 1, type: 'ed25519_public_key' }]
    });
    expect((await POST(request(sign(challenge)))).status).toBe(503);
    mocks.loadAccount.mockResolvedValue({
      account_id: client.publicKey(),
      thresholds: { med_threshold: 1 },
      signers: [{ key: client.publicKey(), weight: '1', type: 'ed25519_public_key' }]
    });
    expect((await POST(request(sign(challenge)))).status).toBe(503);
    expect(mocks.session.save).not.toHaveBeenCalled();
  });
});
