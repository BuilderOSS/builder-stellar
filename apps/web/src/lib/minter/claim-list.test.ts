import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearServerCache } from '@/lib/server-cache';

import { clearClaimTreeFailures, loadClaimTree } from './claim-list';

const scope = { network: 'Test SDF Network ; September 2015', token: 'CTOKEN', root: 'ab'.repeat(32) };

describe('loadClaimTree', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    clearServerCache();
    clearClaimTreeFailures();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers a failed verification for a minute instead of refetching per view', async () => {
    fetchMock.mockImplementation(async () => new Response('{"format":"uniswap"}', { status: 200 }));
    await expect(loadClaimTree('ipfs://bafyfail', scope)).rejects.toThrow('unknown format');
    await expect(loadClaimTree('ipfs://bafyfail', scope)).rejects.toThrow('unknown format');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clearClaimTreeFailures();
    await expect(loadClaimTree('ipfs://bafyfail', scope)).rejects.toThrow('unknown format');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
