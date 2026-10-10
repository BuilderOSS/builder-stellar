import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ actor: vi.fn(), prepare: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  AuthError: class extends Error {},
  getAuthOrigin: () => 'http://localhost:4242',
  requireAuthenticatedSession: mock.actor
}));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: () => ({ name: 'testnet' }) }));
vi.mock('@/lib/treasury-service/funding', () => ({ prepareTreasuryFunding: mock.prepare }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { POST } from './route';

const input = { assetCode: 'USDC', amount: '900719925.4740993' };
const context = { params: Promise.resolve({ daoId: 'dao-a' }) };
function request(body: unknown = input, origin = 'http://localhost:4242', query = '') {
  return new Request(`http://localhost:4242/api/dao/dao-a/treasury/prepare${query}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.actor.mockResolvedValue({ address: 'session-wallet', network: 'testnet' });
  mock.prepare.mockResolvedValue({
    deploymentId: 'deployment-a',
    daoId: 'dao-a',
    address: 'session-wallet',
    xdr: 'unsigned-only'
  });
});

describe('treasury unsigned preparation HTTP identity', () => {
  it('uses server session identity, preserves amount string and returns no-store', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mock.prepare).toHaveBeenCalledWith('dao-a', { address: 'session-wallet', network: 'testnet' }, input);
  });
  it.each(['address', 'treasuryContractId', 'governorContractId', 'deploymentId', 'to', 'from', 'assetContractId'])(
    'rejects untrusted %s',
    async (field) => {
      expect((await POST(request({ ...input, [field]: 'spoof' }), context)).status).toBe(400);
      expect(mock.prepare).not.toHaveBeenCalled();
    }
  );
  it('checks origin before authentication, rejecting missing origin too', async () => {
    expect((await POST(request(input, 'https://evil.example'), context)).status).toBe(403);
    expect((await POST(request(input, ''), context)).status).toBe(403);
    expect(mock.actor).not.toHaveBeenCalled();
  });
  it('rejects network mismatch before service work', async () => {
    mock.actor.mockResolvedValue({ address: 'wallet', network: 'public' });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('does not accept arbitrary destination query parameters or unsupported assets', async () => {
    expect((await POST(request(input, 'http://localhost:4242', '?treasury=attacker'), context)).status).toBe(400);
    expect((await POST(request({ ...input, assetCode: 'EURC' }), context)).status).toBe(400);
    expect((await POST(request({ ...input, amount: 1 }), context)).status).toBe(400);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized JSON without preparation', async () => {
    const invalid = new Request('http://localhost:4242/api/treasury', {
      method: 'POST',
      headers: { Origin: 'http://localhost:4242' },
      body: 'invalid'
    });
    expect((await POST(invalid, context)).status).toBe(400);
    expect((await POST(request({ amount: 'x'.repeat(5000) }), context)).status).toBe(413);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
});
