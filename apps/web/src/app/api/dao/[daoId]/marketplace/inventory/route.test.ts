import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), dao: vi.fn(), inventory: vi.fn() }));
vi.mock('@/config/deployments.generated', () => ({ DEPLOYMENT_ID: 'deployment-a' }));
vi.mock('@/lib/auth/server', () => ({ AuthError: class extends Error {}, requireAuthenticatedSession: mocks.actor }));
vi.mock('@/lib/deployment-config', () => ({ getDeploymentConfig: () => ({ name: 'testnet' }) }));
vi.mock('@/lib/marketplace/service', () => ({ marketplaceDao: mocks.dao }));
vi.mock('@/lib/prisma', () => ({ prisma: { tokenInventory: { findMany: mocks.inventory } } }));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ address: 'wallet-a', network: 'testnet' });
  mocks.dao.mockImplementation((daoId) => Promise.resolve({ daoId, tokenContract: daoId }));
  mocks.inventory.mockResolvedValue([
    { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'dao-a', owner: 'wallet-a', tokenId: 7n }
  ]);
});
function request(daoId: string) {
  return GET(new Request(`http://localhost:4242/api/dao/${daoId}/marketplace/inventory?page=1&owner=spoofed-wallet`), {
    params: Promise.resolve({ daoId })
  });
}
describe('typed marketplace inventory API', () => {
  it('uses the server actor with deployment, DAO and token module filters', async () => {
    const response = await request('dao-a');
    expect(response.status).toBe(200);
    expect(mocks.inventory).toHaveBeenCalledWith({
      where: { deploymentId: 'deployment-a', daoId: 'dao-a', contractId: 'dao-a', owner: 'wallet-a' },
      orderBy: [{ tokenId: 'asc' }, { eventId: 'asc' }],
      skip: 24,
      take: 25
    });
    expect(await response.json()).toEqual({
      deploymentId: 'deployment-a',
      daoId: 'dao-a',
      address: 'wallet-a',
      tokenIds: ['7'],
      hasMore: false
    });
  });
  it('never returns the first DAO inventory for another DAO or deployment', async () => {
    expect((await request('dao-b')).status).toBe(503);
    mocks.inventory.mockResolvedValue([
      { deploymentId: 'deployment-b', daoId: 'dao-a', contractId: 'dao-a', owner: 'wallet-a', tokenId: 7n }
    ]);
    expect((await request('dao-a')).status).toBe(503);
  });
  it('never returns a different authenticated wallet inventory from the same view', async () => {
    mocks.actor.mockResolvedValue({ address: 'wallet-b', network: 'testnet' });
    expect((await request('dao-a')).status).toBe(503);
  });
});
