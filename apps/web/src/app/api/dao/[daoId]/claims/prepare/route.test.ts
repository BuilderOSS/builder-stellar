import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  AuthError: class AuthError extends Error {},
  getAuthOrigin: () => 'http://localhost',
  requireAuthenticatedSession: mocks.session
}));
vi.mock('@/lib/minter/service', async (original) => {
  const service = await original<typeof import('@/lib/minter/service')>();
  return { ...service, prepareClaim: mocks.prepare };
});
vi.mock('@/lib/goldsky', () => ({ getGoldskyMinterClaims: vi.fn() }));
vi.mock('@/lib/dao-config', () => ({ getDaoNetworkConfigById: vi.fn() }));

import { POST } from './route';

describe('claim prepare API session boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ address: 'session-actor', network: 'testnet' });
    mocks.prepare.mockResolvedValue({ xdr: 'prepared' });
  });
  const post = (body: unknown, origin = 'http://localhost', daoId = 'dao-a') =>
    POST(
      new Request(`http://localhost/api/dao/${daoId}/claims/prepare`, {
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      { params: Promise.resolve({ daoId }) }
    );
  it('prepares only with session identity for each DAO and prevents shared caching', async () => {
    const action = { method: 'allowlist', round: 3 };
    const response = await post(action);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.prepare).toHaveBeenCalledWith('dao-a', { address: 'session-actor', network: 'testnet' }, action);
    await post(action, 'http://localhost', 'dao-b');
    expect(mocks.prepare.mock.calls[1][0]).toBe('dao-b');
  });
  it.each(['address', 'recipient', 'token_id', 'minterContractId', 'network', 'rpcUrl', 'amount'])(
    'rejects body-supplied %s on allowlist claims',
    async (key) => {
      expect((await post({ method: 'allowlist', round: 3, [key]: 'attacker-input' })).status).toBe(400);
      expect(mocks.prepare).not.toHaveBeenCalled();
    }
  );
  it.each([
    { method: 'merkle', round: 2, amount: 5, proof: [] },
    { method: 'merkle', round: 2, amount: '5', proof: ['bad'] },
    { method: 'allowlist', round: '3' },
    { method: 'allowlist', round: 4294967296 },
    { method: 'paid', round: 1 }
  ])('rejects malformed or unsupported ABI input %j', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('rejects cross-origin and unauthenticated requests before preparing', async () => {
    expect((await post({ method: 'allowlist', round: 3 }, 'http://attacker')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    const { AuthError } = await import('@/lib/auth/server');
    mocks.session.mockRejectedValue(new AuthError('UNAUTHENTICATED', 'Authentication required.'));
    expect((await post({ method: 'allowlist', round: 3 })).status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('does not return a transaction on failed simulation or oversized proof input', async () => {
    mocks.prepare.mockRejectedValue(new Error('Error(Contract, #8)'));
    const response = await post({ method: 'allowlist', round: 3 });
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty('xdr');
    mocks.prepare.mockClear();
    expect(
      (await post({ method: 'merkle', round: 2, amount: '5', proof: new Array(33).fill('ab'.repeat(32)) })).status
    ).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
