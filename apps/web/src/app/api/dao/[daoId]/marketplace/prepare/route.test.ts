import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ actor: vi.fn(), prepare: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  AuthError: class extends Error {},
  getAuthOrigin: () => 'http://localhost:4242',
  requireAuthenticatedSession: mock.actor
}));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: () => ({ name: 'testnet' }) }));
vi.mock('@/lib/marketplace/actions', async (original) => ({
  ...(await original<typeof import('@/lib/marketplace/actions')>()),
  prepareMarketplaceAction: mock.prepare
}));
// Only schema validation is real in this HTTP test; no database or RPC is ever reached.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { POST } from './route';

const body = { action: 'buy', kind: 'primary', id: '9007199254740993', eventId: 'event-a' };
const context = { params: Promise.resolve({ daoId: 'dao-a' }) };
function request(value: unknown = body, origin = 'http://localhost:4242') {
  return new Request('http://localhost:4242/api/dao/dao-a/marketplace/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(value)
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.actor.mockResolvedValue({ address: 'authenticated-wallet', network: 'testnet' });
  mock.prepare.mockResolvedValue({
    deploymentId: 'deployment-a',
    daoId: 'dao-a',
    address: 'authenticated-wallet',
    network: 'testnet',
    xdr: 'prepared-envelope',
    fee: '100',
    summary: 'Pay the Treasury and mint an NFT'
  });
});

describe('marketplace preparation API authenticated identity', () => {
  it('passes the server actor and typed primary id to the service, never body actor fields', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mock.prepare).toHaveBeenCalledWith('dao-a', { address: 'authenticated-wallet', network: 'testnet' }, body);
    expect(await response.json()).toMatchObject({ address: 'authenticated-wallet', daoId: 'dao-a', fee: '100' });
  });
  it.each(['buyer', 'seller', 'address'])('rejects spoofed %s fields', async (field) => {
    expect((await POST(request({ ...body, [field]: 'spoofed-wallet' }), context)).status).toBe(400);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('requires same origin before session or service work', async () => {
    expect((await POST(request(body, 'https://attacker.example'), context)).status).toBe(403);
    expect(mock.actor).not.toHaveBeenCalled();
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('rejects network-mismatched authentication before preparing', async () => {
    mock.actor.mockResolvedValue({ address: 'authenticated-wallet', network: 'public' });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('rejects malformed and oversized body without a service mutation', async () => {
    const malformed = new Request('http://localhost:4242/api/marketplace', {
      method: 'POST',
      headers: { Origin: 'http://localhost:4242' },
      body: 'not-json'
    });
    expect((await POST(malformed, context)).status).toBe(400);
    expect((await POST(request({ filler: 'x'.repeat(5000) }), context)).status).toBe(413);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
});
