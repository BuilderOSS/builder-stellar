import { Keypair, Networks, NotFoundError, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthMessage } from '@/lib/auth/message';
import { assertSignableSep10Challenge } from '@/lib/auth/sep10-proof';
import type { AuthChallengeResponse, Sep10ChallengeResponse } from '@/lib/auth/types';

/**
 * Both sign-in paths through the real route handlers, with a real sealed session cookie. Only the
 * browser's cookie jar, Horizon and the rate limiter are stand-ins.
 */
const mocks = vi.hoisted(() => ({
  jar: new Map<string, { value: string; options: Record<string, unknown> }>(),
  loadAccount: vi.fn()
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      if (options.maxAge === 0) mocks.jar.delete(name);
      else mocks.jar.set(name, { value, options });
    }
  })
}));
vi.mock('@stellar/stellar-sdk', async (original) => {
  const sdk = await original<typeof import('@stellar/stellar-sdk')>();
  return {
    ...sdk,
    Horizon: {
      ...sdk.Horizon,
      Server: class {
        loadAccount = mocks.loadAccount;
      }
    }
  };
});
vi.mock('@/lib/auth/rate-limit', () => ({ enforceAuthRateLimit: () => null }));

import { POST as sep53Challenge } from './challenge/route';
import { POST as logout } from './logout/route';
import * as sep10ChallengeRoute from './sep10/challenge/route';
import { POST as sep10Verify } from './sep10/verify/route';
import { GET as readSession } from './session/route';
import { POST as sep53Verify } from './verify/route';

const ORIGIN = 'https://app.example.test';
const PASSWORD_A = 'session-secret-a-0123456789abcdefghij';
const PASSWORD_B = 'session-secret-b-0123456789abcdefghij';
const HOUR = 60 * 60 * 1000;
const server = Keypair.random();
let client: Keypair;

const notFound = () =>
  new NotFoundError('Account not found', { status: 404, type: 'https://stellar.org/horizon-errors/not_found' });
function account(masterWeight: number, medThreshold: number, others: Array<{ key: string; weight: number }> = []) {
  return {
    account_id: client.publicKey(),
    thresholds: { low_threshold: 0, med_threshold: medThreshold, high_threshold: medThreshold },
    signers: [
      { key: client.publicKey(), weight: masterWeight, type: 'ed25519_public_key' },
      ...others.map((other) => ({ ...other, type: 'ed25519_public_key' }))
    ]
  };
}

/** A POST from the app's own page by default; `from` sets the browser's origin headers. */
function post(path: string, body: unknown, from: Record<string, string> = { 'sec-fetch-site': 'same-origin' }) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...from },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}
async function session() {
  return (await readSession(new Request(`${ORIGIN}/api/auth/session`))).json();
}

async function signInSep53(signer = client) {
  const challenge = (await (
    await sep53Challenge(post('/api/auth/challenge', { address: client.publicKey() }))
  ).json()) as AuthChallengeResponse;
  const message = createAuthMessage({
    appName: challenge.appName,
    address: client.publicKey(),
    domain: challenge.domain,
    uri: challenge.uri,
    network: challenge.network,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expirationTime: challenge.expirationTime,
    serverPublicKey: challenge.serverPublicKey,
    serverSignature: challenge.serverSignature
  });
  const signature = Buffer.from(signer.signMessage(message)).toString('base64');
  return sep53Verify(post('/api/auth/verify', { address: client.publicKey(), message, signature }));
}

async function requestSep10() {
  const response = await sep10ChallengeRoute.POST(post('/api/auth/sep10/challenge', { address: client.publicKey() }));
  expect(response.status).toBe(200);
  return (await response.json()) as Sep10ChallengeResponse;
}
function signChallenge(xdr: string, ...signers: Keypair[]) {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
  tx.sign(...signers);
  return tx.toXDR();
}

beforeEach(() => {
  mocks.jar.clear();
  mocks.loadAccount.mockReset();
  client = Keypair.random();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_NETWORK', 'testnet');
  vi.stubEnv('APP_URL', ORIGIN);
  vi.stubEnv('IRON_PASSWORD', PASSWORD_A);
  vi.stubEnv('STELLAR_WEB_AUTH_SECRET', server.secret());
  vi.stubEnv('STELLAR_HOME_DOMAIN', 'app.example.test');
  vi.stubEnv('STELLAR_WEB_AUTH_DOMAIN', 'app.example.test');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SEP-53 sign-in', () => {
  it('signs in an address that has no account yet, on Horizon’s authoritative not-found answer', async () => {
    mocks.loadAccount.mockRejectedValue(notFound());
    expect((await signInSep53()).status).toBe(200);
    expect(await session()).toEqual({ authenticated: true, address: client.publicKey(), authMethod: 'sep53' });
    expect(mocks.loadAccount).toHaveBeenCalledWith(client.publicKey());
  });

  it('signs in when the master key still meets the medium threshold', async () => {
    mocks.loadAccount.mockResolvedValue(account(2, 2));
    expect((await signInSep53()).status).toBe(200);
    expect((await session()).authenticated).toBe(true);
  });

  it('refuses an account whose master key is disabled, even with zero thresholds', async () => {
    const other = Keypair.random().publicKey();
    for (const med of [0, 1]) {
      mocks.loadAccount.mockResolvedValue(account(0, med, [{ key: other, weight: 1 }]));
      const response = await signInSep53();
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe('INSUFFICIENT_SIGNER_WEIGHT');
      expect((await session()).authenticated).toBe(false);
    }
  });

  it('refuses a master key whose weight is below the medium threshold', async () => {
    mocks.loadAccount.mockResolvedValue(account(1, 2, [{ key: Keypair.random().publicKey(), weight: 1 }]));
    const response = await signInSep53();
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('INSUFFICIENT_SIGNER_WEIGHT');
    expect((await session()).authenticated).toBe(false);
  });

  it('refuses with 503 when Horizon can’t be read, and never treats that as "no account"', async () => {
    mocks.loadAccount.mockRejectedValue(new Error('Horizon unavailable'));
    const response = await signInSep53();
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('ACCOUNT_LOOKUP_UNAVAILABLE');
    expect((await session()).authenticated).toBe(false);
  });

  it('checks the signature before it looks the account up', async () => {
    mocks.loadAccount.mockRejectedValue(notFound());
    const response = await signInSep53(Keypair.random());
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('INVALID_SIGNATURE');
    expect(mocks.loadAccount).not.toHaveBeenCalled();
  });

  const sessionWriters = [
    [sep53Challenge, '/api/auth/challenge'],
    [sep10ChallengeRoute.POST, '/api/auth/sep10/challenge'],
    [sep53Verify, '/api/auth/verify'],
    [sep10Verify, '/api/auth/sep10/verify'],
    [logout, '/api/auth/logout']
  ] as const;

  it.each([
    ['another site', { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' }],
    ['a sibling subdomain', { 'sec-fetch-site': 'same-site', origin: 'https://dev.example.test' }],
    ['an older browser on another site', { origin: 'https://attacker.example' }]
  ])('refuses sign-in requests from %s without touching the session', async (_label, from) => {
    mocks.loadAccount.mockRejectedValue(notFound());
    expect((await signInSep53()).status).toBe(200);
    const cookie = [...mocks.jar.values()][0].value;
    for (const [handler, path] of sessionWriters) {
      const response = await handler(post(path, { address: client.publicKey() }, from));
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('CROSS_SITE_REQUEST');
    }
    expect([...mocks.jar.values()][0].value).toBe(cookie);
    expect((await session()).authenticated).toBe(true);
  });

  it.each([
    ['an older browser on this site', { origin: ORIGIN }],
    ['a client that is not a browser page', {}]
  ])('accepts sign-in requests from %s', async (_label, from) => {
    const response = await sep53Challenge(post('/api/auth/challenge', { address: client.publicKey() }, from));
    expect(response.status).toBe(200);
  });
});

describe('SEP-10 sign-in', () => {
  it('exports no GET handler for the challenge, so only a POST can write the session', () => {
    expect('GET' in sep10ChallengeRoute).toBe(false);
    expect(typeof sep10ChallengeRoute.POST).toBe('function');
  });

  it('issues a challenge the browser can check, then signs in with the master key', async () => {
    mocks.loadAccount.mockResolvedValue(account(1, 1));
    const challenge = await requestSep10();
    expect(challenge).toMatchObject({ homeDomain: 'app.example.test', webAuthDomain: 'app.example.test' });
    expect(() =>
      assertSignableSep10Challenge(challenge.xdr, {
        address: client.publicKey(),
        networkPassphrase: Networks.TESTNET,
        serverPublicKey: server.publicKey(),
        homeDomain: challenge.homeDomain,
        webAuthDomain: challenge.webAuthDomain
      })
    ).not.toThrow();
    const response = await sep10Verify(
      post('/api/auth/sep10/verify', { signedTxXdr: signChallenge(challenge.xdr, client) })
    );
    expect(response.status).toBe(200);
    expect(await session()).toEqual({ authenticated: true, address: client.publicKey(), authMethod: 'sep10' });
  });

  it('refuses an account whose master key is disabled, even with zero thresholds', async () => {
    for (const med of [0, 1]) {
      mocks.loadAccount.mockResolvedValue(account(0, med, [{ key: Keypair.random().publicKey(), weight: 1 }]));
      const challenge = await requestSep10();
      const response = await sep10Verify(
        post('/api/auth/sep10/verify', { signedTxXdr: signChallenge(challenge.xdr, client) })
      );
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe('INVALID_SIGNATURE');
      expect((await session()).authenticated).toBe(false);
    }
  });

  it('answers malformed requests with 400', async () => {
    expect((await sep10ChallengeRoute.POST(post('/api/auth/sep10/challenge', '{not json'))).status).toBe(400);
    expect((await sep10ChallengeRoute.POST(post('/api/auth/sep10/challenge', { address: 'GNOPE' }))).status).toBe(400);
    expect((await sep53Challenge(post('/api/auth/challenge', '{not json'))).status).toBe(400);
  });
});

describe('session lifetime', () => {
  async function signedInAt(start: number) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
    mocks.loadAccount.mockRejectedValue(notFound());
    expect((await signInSep53()).status).toBe(200);
  }

  it('ends after the idle limit when the session is not used', async () => {
    const start = Date.now();
    await signedInAt(start);
    // iron-session allows one minute of clock skew past the sealed expiry.
    vi.setSystemTime(start + 24 * HOUR + 2 * 60 * 1000);
    expect((await session()).authenticated).toBe(false);
  });

  it('slides while in use, but never past the absolute limit', async () => {
    const start = Date.now();
    await signedInAt(start);
    for (const hours of [20, 40, 60]) {
      vi.setSystemTime(start + hours * HOUR);
      expect((await session()).authenticated).toBe(true);
    }
    vi.setSystemTime(start + 72 * HOUR + 1000);
    expect(await session()).toEqual({ authenticated: false, address: null, authMethod: null });
  });

  it('uses a __Host- cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.loadAccount.mockRejectedValue(notFound());
    expect((await signInSep53()).status).toBe(200);
    const [[name, cookie]] = [...mocks.jar.entries()];
    expect(name).toBe('__Host-stellar-auth');
    expect(cookie.options).toMatchObject({ secure: true, path: '/', httpOnly: true, sameSite: 'lax' });
    expect(cookie.options).not.toHaveProperty('domain');
  });

  it('keeps sessions through an IRON_PASSWORD rotation, and ends them when the old secret is removed', async () => {
    const start = Date.now();
    await signedInAt(start);

    vi.stubEnv('IRON_PASSWORD', JSON.stringify({ 1: PASSWORD_A, 2: PASSWORD_B }));
    expect((await session()).authenticated).toBe(true);
    // Removing secret 1 ends a cookie still sealed with it.
    vi.stubEnv('IRON_PASSWORD', JSON.stringify({ 2: PASSWORD_B }));
    expect((await session()).authenticated).toBe(false);

    // A cookie re-issued during the overlap is sealed with secret 2 and survives the removal.
    vi.stubEnv('IRON_PASSWORD', PASSWORD_A);
    await signedInAt(start);
    vi.stubEnv('IRON_PASSWORD', JSON.stringify({ 1: PASSWORD_A, 2: PASSWORD_B }));
    vi.setSystemTime(start + HOUR);
    expect((await session()).authenticated).toBe(true);
    vi.stubEnv('IRON_PASSWORD', JSON.stringify({ 2: PASSWORD_B }));
    expect((await session()).authenticated).toBe(true);
  });

  it('signs out with logout', async () => {
    mocks.loadAccount.mockRejectedValue(notFound());
    expect((await signInSep53()).status).toBe(200);
    expect((await logout(post('/api/auth/logout', {}))).status).toBe(200);
    expect((await session()).authenticated).toBe(false);
  });
});
