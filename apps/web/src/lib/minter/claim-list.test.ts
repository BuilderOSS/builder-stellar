import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IPFS_GATEWAYS } from '@/lib/ipfs-gateway';
import { clearServerCache } from '@/lib/server-cache';

import { CLAIM_LIST_UNREACHABLE, claimListState, clearClaimTreeFailures, loadClaimTree } from './claim-list';

// The server fetch (undici) and DNS are mocked; the platform fetch is stubbed with the same mock,
// so code that went back to it would show up in the calls.
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: mocks.fetch
}));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup, default: { lookup: mocks.lookup } }));

const PRIVATE_HOST = 'internal.example';
const scope = { network: 'Test SDF Network ; September 2015', token: 'CTOKEN', root: 'ab'.repeat(32) };

describe('loadClaimTree', () => {
  const fetchMock = mocks.fetch;
  beforeEach(() => {
    clearServerCache();
    clearClaimTreeFailures();
    fetchMock.mockReset();
    mocks.lookup.mockReset();
    mocks.lookup.mockImplementation(async (host: string) => [
      host === PRIVATE_HOST ? { address: '10.0.0.7', family: 4 } : { address: '93.184.216.34', family: 4 }
    ]);
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers a failed verification for a minute instead of refetching per view', async () => {
    fetchMock.mockImplementation(async () => new Response('{"format":"uniswap"}', { status: 200 }));
    const perLoad = IPFS_GATEWAYS.length;
    await expect(loadClaimTree('ipfs://bafyfail', scope)).rejects.toThrow('unknown format');
    await expect(loadClaimTree('ipfs://bafyfail', scope)).rejects.toThrow('unknown format');
    expect(fetchMock).toHaveBeenCalledTimes(perLoad);
    clearClaimTreeFailures();
    await expect(loadClaimTree('ipfs://bafyfail', scope)).rejects.toThrow('unknown format');
    expect(fetchMock).toHaveBeenCalledTimes(2 * perLoad);
  });

  // BUG-W06-1: an unpinned list showed members the gateway's status code ("530") as the reason.
  it('names an unreachable list in words, not the last gateway status', async () => {
    fetchMock.mockImplementation(async () => new Response('origin unreachable', { status: 530 }));
    const state = await claimListState({ root: scope.root, treeUri: 'ipfs://bafyunpinned' }, scope, null);
    expect(state).toEqual({ status: 'unavailable', reason: CLAIM_LIST_UNREACHABLE });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('names a timeout or a body that is not JSON the same way', async () => {
    fetchMock
      .mockImplementationOnce(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      })
      .mockImplementation(async () => new Response('<html>gateway</html>', { status: 200 }));
    await expect(loadClaimTree('ipfs://bafyhtml', scope)).rejects.toThrow(CLAIM_LIST_UNREACHABLE);
  });

  it('still says when the file is too large', async () => {
    fetchMock.mockImplementation(
      async () => new Response('{}', { status: 200, headers: { 'content-length': String(13 * 1024 * 1024) } })
    );
    await expect(loadClaimTree('ipfs://bafybig', scope)).rejects.toThrow('The claim list is too large.');
  });

  // BUG-W06-2: gateways were tried one after another, 15s each, so an unreachable list held the page.
  it('asks every gateway at once and takes the first answer', async () => {
    const tree = '{"format":"uniswap"}';
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(IPFS_GATEWAYS[2]!) ? new Response(tree, { status: 200 }) : new Promise<Response>(() => {})
    );
    await expect(loadClaimTree('ipfs://bafyslow', scope)).rejects.toThrow('unknown format');
    expect(fetchMock).toHaveBeenCalledTimes(IPFS_GATEWAYS.length);
  });

  it('gives up on the whole fetch after one budget, not one per gateway', async () => {
    const budget = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(budget.signal);
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          )
      );
      const loading = loadClaimTree('ipfs://bafyhang', scope);
      budget.abort();
      await expect(loading).rejects.toThrow(CLAIM_LIST_UNREACHABLE);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

  describe('redirects', () => {
    const tree = '{"format":"uniswap"}';
    /** Every gateway redirects to `target`; a fetch that follows redirects requests it itself. */
    function redirectTo(target: string) {
      const requested: string[] = [];
      fetchMock.mockImplementation(async function respond(url: string, init?: RequestInit): Promise<Response> {
        requested.push(url);
        if (url === target) return new Response(tree, { status: 200 });
        if (init?.redirect !== 'manual') return respond(target, init);
        return new Response(null, { status: 302, headers: { location: target } });
      });
      return requested;
    }

    it('refuses a gateway redirect to a private address and never requests it', async () => {
      const requested = redirectTo(`https://${PRIVATE_HOST}/latest/meta-data`);
      await expect(loadClaimTree('ipfs://bafyredirect', scope)).rejects.toThrow(CLAIM_LIST_UNREACHABLE);
      expect(requested.some((url) => url.includes(PRIVATE_HOST))).toBe(false);
      expect(mocks.lookup).toHaveBeenCalledWith(PRIVATE_HOST, expect.anything());
    });

    it('refuses a redirect to plain http', async () => {
      const requested = redirectTo('http://93.184.216.34/list.json');
      await expect(loadClaimTree('ipfs://bafyhttp', scope)).rejects.toThrow(CLAIM_LIST_UNREACHABLE);
      expect(requested.some((url) => url.startsWith('http:'))).toBe(false);
    });

    it('follows a redirect to another public HTTPS host, checking it first', async () => {
      const requested = redirectTo('https://bafyok.ipfs.dweb.link/');
      // The file loads and reaches verification, which rejects this test tree.
      await expect(loadClaimTree('ipfs://bafyok', scope)).rejects.toThrow('unknown format');
      expect(requested).toContain('https://bafyok.ipfs.dweb.link/');
      expect(mocks.lookup).toHaveBeenCalledWith('bafyok.ipfs.dweb.link', expect.anything());
      expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === 'manual' && init.dispatcher)).toBe(true);
    });
  });
});
