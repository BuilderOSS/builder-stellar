import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), prepare: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  AuthError: class extends Error {},
  getAuthOrigin: () => 'http://localhost',
  requireAuthenticatedSession: mocks.session
}));
vi.mock('@/lib/token-holder/actions', async (original) => ({
  ...(await original<typeof import('@/lib/token-holder/actions')>()),
  prepareHolderAction: mocks.prepare
}));
// Isolate server imports even though this test exercises the real request schema.
vi.mock('@/lib/member-directory/query', () => ({ directoryScope: vi.fn() }));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: vi.fn() }));

import { AuthError } from '@/lib/auth/server';
import { HolderError } from '@/lib/token-holder/actions';

import { POST } from './route';

describe('authenticated holder preparation API', () => {
  const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const body = { action: 'revoke', tokenId: '0' };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ address, network: 'testnet' });
    mocks.prepare.mockResolvedValue({ address, daoId: 'dao-a', xdr: 'unsigned-only' });
  });
  function request(value: unknown = body, origin = 'http://localhost', daoId = 'dao-a') {
    return POST(
      new Request(`http://localhost/api/dao/${daoId}/tokens/prepare`, {
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
      }),
      { params: Promise.resolve({ daoId }) }
    );
  }
  it('takes identity only from the authenticated server session', async () => {
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.prepare).toHaveBeenCalledWith('dao-a', { address, network: 'testnet' }, body);
    await request(body, 'http://localhost', 'dao-b');
    expect(mocks.prepare.mock.calls[1][0]).toBe('dao-b');
  });
  it('rejects spoofed identity instead of accepting it', async () => {
    expect((await request({ ...body, address })).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('rejects cross-origin before authentication or simulation', async () => {
    expect((await request(body, 'https://evil.example')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated preparation', async () => {
    mocks.session.mockRejectedValue(new AuthError('UNAUTHENTICATED', 'Authentication is required.'));
    expect((await request()).status).toBe(401);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('returns ownership conflict without sending an envelope', async () => {
    mocks.prepare.mockRejectedValue(new HolderError('Ownership changed.', 409));
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).xdr).toBeUndefined();
  });
  it('rejects malformed JSON and oversized requests', async () => {
    const malformed = new Request('http://localhost/api', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: '{'
    });
    expect((await POST(malformed, { params: Promise.resolve({ daoId: 'dao-a' }) })).status).toBe(400);
    expect((await request('x'.repeat(2049))).status).toBe(413);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
