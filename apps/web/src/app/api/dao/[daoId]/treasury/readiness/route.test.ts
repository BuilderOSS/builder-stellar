import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ actor: vi.fn(), readiness: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ AuthError: class extends Error {}, requireAuthenticatedSession: mock.actor }));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: () => ({ name: 'testnet' }) }));
vi.mock('@/lib/treasury-service/funding', () => ({ treasuryReadiness: mock.readiness }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { GET } from './route';

const context = { params: Promise.resolve({ daoId: 'dao-a' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mock.actor.mockResolvedValue({ address: 'session-wallet', network: 'testnet' });
  mock.readiness.mockResolvedValue({ address: 'session-wallet' });
});

describe('treasury funding readiness HTTP identity', () => {
  it('reads the account from session, with only supported asset code from query', async () => {
    const response = await GET(new Request('http://localhost/api/treasury/readiness?assetCode=USDC'), context);
    expect(response.status).toBe(200);
    expect(mock.readiness).toHaveBeenCalledWith('dao-a', { address: 'session-wallet', network: 'testnet' }, 'USDC');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each([
    'assetCode=XLM&address=spoofed',
    'assetCode=XLM&treasury=spoofed',
    'assetCode=XLM&assetCode=USDC',
    'assetCode=EURC',
    'assetCode=unknown',
    ''
  ])('rejects unsupported/spoofed query %s', async (query) => {
    expect((await GET(new Request(`http://localhost/api/treasury/readiness?${query}`), context)).status).toBe(400);
    expect(mock.readiness).not.toHaveBeenCalled();
  });
  it('rejects mismatched authenticated network', async () => {
    mock.actor.mockResolvedValue({ address: 'session-wallet', network: 'public' });
    expect((await GET(new Request('http://localhost/api/treasury/readiness?assetCode=XLM'), context)).status).toBe(401);
    expect(mock.readiness).not.toHaveBeenCalled();
  });
});
