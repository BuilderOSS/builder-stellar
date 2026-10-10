import { beforeEach, describe, expect, it, vi } from 'vitest';

import { treasuryFetchKey, treasuryKey } from './hooks';

const scope = {
  deploymentId: 'deployment-a',
  daoId: 'dao-a',
  treasuryContractId: 'treasury-a',
  governorContractId: 'governor-a'
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...scope, address: 'wallet-a' }) });
});

describe('treasury query identity and cache separation', () => {
  it('includes deployment, DAO, treasury, governor, page/asset URL and account', () => {
    const key = treasuryKey(scope, 'readiness', '/api/readiness?assetCode=XLM', 'wallet-a');
    expect(key).toEqual([
      'treasury',
      'deployment-a',
      'dao-a',
      'treasury-a',
      'governor-a',
      'readiness',
      '/api/readiness?assetCode=XLM',
      'wallet-a'
    ]);
    for (const field of Object.keys(scope))
      expect(treasuryKey({ ...scope, [field]: 'other' }, 'readiness', key[6], 'wallet-a')).not.toEqual(key);
    expect(treasuryKey(scope, 'readiness', '/api/readiness?assetCode=USDC', 'wallet-a')).not.toEqual(key);
    expect(treasuryKey(scope, 'readiness', key[6], 'wallet-b')).not.toEqual(key);
  });
  it('fetches same-origin no-store and rejects foreign or missing identity before caching', async () => {
    const key = treasuryKey(scope, 'history', '/api/history?page=0');
    expect(await treasuryFetchKey(key)).toMatchObject(scope);
    expect(fetchMock).toHaveBeenCalledWith(key[6], { cache: 'no-store', credentials: 'same-origin' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...scope, daoId: 'other' }) });
    await expect(treasuryFetchKey(key)).rejects.toThrow('identity mismatch');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ calls: [] }) });
    await expect(treasuryFetchKey(key)).rejects.toThrow('identity mismatch');
  });
  it('rejects a response from a different authenticated account', async () => {
    await expect(treasuryFetchKey(treasuryKey(scope, 'readiness', '/api/readiness', 'wallet-b'))).rejects.toThrow(
      'account changed'
    );
  });
});
