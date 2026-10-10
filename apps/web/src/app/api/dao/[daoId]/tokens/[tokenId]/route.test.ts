import { Keypair } from '@stellar/stellar-sdk';
import { Err } from '@stellar/stellar-sdk/contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { missingTokenRead } from '@/lib/token-holder/read-test-fixtures';

const mocks = vi.hoisted(() => ({ scope: vi.fn(), indexed: vi.fn(), live: vi.fn(), metadata: vi.fn() }));
vi.mock('@/lib/member-directory/query', () => ({ directoryScope: mocks.scope }));
vi.mock('@/lib/prisma', () => ({ prisma: { tokenInventory: { findFirst: mocks.indexed } } }));
vi.mock('@/lib/onchain-token-metadata', () => ({ resolveOnchainTokenMetadata: mocks.metadata }));
vi.mock('@/lib/token-holder/actions', () => ({ holderClient: () => ({ owner_of: mocks.live }) }));

import { GET } from './route';

describe('token detail API', () => {
  const indexedOwner = Keypair.random().publicKey();
  const liveOwner = Keypair.random().publicKey();
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scope.mockImplementation(async (daoId: string) => ({
      deploymentId: 'dep-a',
      daoId,
      config: { tokenName: daoId, adminAddress: 'read-source' }
    }));
    mocks.indexed.mockResolvedValue({ owner: indexedOwner });
    mocks.live.mockResolvedValue({ simulationData: {}, result: liveOwner });
    mocks.metadata.mockResolvedValue({ name: 'Actual DAO #0', description: 'Actual artwork description' });
  });
  const request = (tokenId = '0', daoId = 'dao-a') =>
    GET(new Request(`http://localhost/api/dao/${daoId}/tokens/${tokenId}`), {
      params: Promise.resolve({ daoId, tokenId })
    });
  it('prefers current chain owner and reads exact scoped indexed owner', async () => {
    const response = await request();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const data = await response.json();
    expect(data.owner).toBe(liveOwner);
    expect(data.ownerSource).toBe('onchain');
    expect(data.indexedOwner).toBe(indexedOwner);
    expect(data.metadata.name).toBe('Actual DAO #0');
    expect(mocks.indexed).toHaveBeenCalledWith({
      where: { deploymentId: 'dep-a', daoId: 'dao-a', contractId: 'dao-a', tokenId: 0n }
    });
    await request('4294967295', 'dao-b');
    expect(mocks.indexed.mock.calls[1][0].where).toEqual({
      deploymentId: 'dep-a',
      daoId: 'dao-b',
      contractId: 'dao-b',
      tokenId: 4294967295n
    });
  });
  it('labels indexed fallback and metadata failure honestly', async () => {
    mocks.live.mockRejectedValue(new Error('RPC offline'));
    mocks.metadata.mockRejectedValue(new Error('metadata offline'));
    const data = await (await request()).json();
    expect(data.owner).toBe(indexedOwner);
    expect(data.ownerSource).toBe('indexed');
    expect(data.metadata).toBeNull();
    expect(data.metadataIssue).toBeTruthy();
  });
  it('never invents an owner when both reads fail', async () => {
    mocks.live.mockRejectedValue(new Error('RPC offline'));
    mocks.indexed.mockRejectedValue(new Error('DB offline'));
    const data = await (await request()).json();
    expect(data.owner).toBeNull();
    expect(data.ownerSource).toBe('unavailable');
  });
  it('rejects non-u32 IDs before any data access', async () => {
    expect((await request('4294967296')).status).toBe(400);
    expect(mocks.scope).not.toHaveBeenCalled();
  });
  it('never returns the SDK-recognized NonExistentToken Err as an owner', async () => {
    const tx = await missingTokenRead();
    expect(tx.result).toBeInstanceOf(Err);
    expect(() => tx.simulationData).toThrow('simulation failed');
    mocks.live.mockResolvedValue(tx);
    mocks.indexed.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.owner).toBeNull();
    expect(data.ownerSource).toBe('unavailable');
  });
  it('keeps the indexed fallback contract for a recognized SDK owner error', async () => {
    mocks.live.mockResolvedValue(await missingTokenRead());
    const data = await (await request()).json();
    expect(data.owner).toBe(indexedOwner);
    expect(data.ownerSource).toBe('indexed');
  });
  it.each([new Err({ message: 'NonExistentToken' }), { address: 'not-an-address' }, 'invalid', null])(
    'rejects invalid decoded owners even when the simulation promise fulfills: %s',
    async (result) => {
      mocks.live.mockResolvedValue({ simulationData: {}, result });
      mocks.indexed.mockResolvedValue({ owner: result });
      const data = await (await request()).json();
      expect(data.owner).toBeNull();
      expect(data.indexedOwner).toBeNull();
      expect(data.ownerSource).toBe('unavailable');
    }
  );
  it('accepts a contract address as a live token holder', async () => {
    const contractOwner = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
    mocks.live.mockResolvedValue({ simulationData: {}, result: contractOwner });
    const data = await (await request()).json();
    expect(data.owner).toBe(contractOwner);
    expect(data.ownerSource).toBe('onchain');
  });
});
