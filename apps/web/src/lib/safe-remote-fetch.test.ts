import { beforeEach, describe, expect, it, vi } from 'vitest';

type LookupCallback = (error: Error | null, address: unknown, family?: number) => void;
type AgentOptions = {
  connect: { lookup: (host: string, options: { all?: boolean }, callback: LookupCallback) => void };
};

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  lookup: vi.fn(),
  agents: [] as { options: AgentOptions; destroy: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[]
}));
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: mocks.fetch,
  Agent: class {
    destroy = vi.fn(async () => undefined);
    close = vi.fn(() => new Promise(() => {}));
    constructor(public options: AgentOptions) {
      mocks.agents.push(this);
    }
  }
}));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup, default: { lookup: mocks.lookup } }));

import { fetchSafeImage } from './safe-image-fetch';
import { fetchPublicUrl } from './safe-remote-fetch';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const text = async (response: { text(): Promise<string> }) => response.text();

describe('fetchPublicUrl', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.agents.length = 0;
    mocks.lookup.mockReset();
    mocks.lookup.mockImplementation(async (host: string) =>
      host === 'internal.example'
        ? [{ address: '169.254.169.254', family: 4 }]
        : [{ address: '93.184.216.34', family: 4 }]
    );
  });

  it('connects only to the address it checked, whatever a later DNS answer says', async () => {
    mocks.fetch.mockResolvedValue(new Response('ok'));
    expect(await fetchPublicUrl('https://public.example/x', AbortSignal.timeout(5000), text)).toBe('ok');
    const { lookup } = mocks.agents[0].options.connect;
    const single = await new Promise((resolve) => lookup('public.example', {}, (_e, address) => resolve(address)));
    const all = await new Promise((resolve) =>
      lookup('public.example', { all: true }, (_e, address) => resolve(address))
    );
    expect(single).toBe('93.184.216.34');
    expect(all).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a private address or plain http before any request', async () => {
    await expect(fetchPublicUrl('https://internal.example/', AbortSignal.timeout(5000), text)).rejects.toThrow(
      /private address/
    );
    await expect(fetchPublicUrl('http://public.example/', AbortSignal.timeout(5000), text)).rejects.toThrow(/HTTPS/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('destroys each connection, so an unread redirect body cannot hold the fetch', async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('moved', { status: 302, headers: { location: 'https://next.example/' } }))
      .mockResolvedValueOnce(new Response('ok'));
    expect(await fetchPublicUrl('https://public.example/', AbortSignal.timeout(5000), text)).toBe('ok');
    expect(mocks.agents).toHaveLength(2);
    for (const agent of mocks.agents) {
      expect(agent.destroy).toHaveBeenCalled();
      // close() waits for unread bodies; here it never resolves, so calling it would hang this test.
      expect(agent.close).not.toHaveBeenCalled();
    }
  });

  it('stops after three redirects', async () => {
    mocks.fetch.mockImplementation(async () => new Response(null, { status: 301, headers: { location: '/again' } }));
    await expect(fetchPublicUrl('https://public.example/', AbortSignal.timeout(5000), text)).rejects.toThrow(
      'Too many redirects'
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });
});

describe('fetchSafeImage', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.lookup.mockReset();
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('returns a PNG within the size cap', async () => {
    mocks.fetch.mockResolvedValue(new Response(PNG_1X1));
    const image = await fetchSafeImage('https://art.example/layer.png', AbortSignal.timeout(5000), 1024);
    expect(image.equals(PNG_1X1)).toBe(true);
  });

  it('refuses a body that is not an allowed image, or is too large', async () => {
    mocks.fetch.mockImplementation(async () => new Response('<svg onload="x()"/>'));
    await expect(fetchSafeImage('https://art.example/a.svg', AbortSignal.timeout(5000), 1024)).rejects.toThrow();
    mocks.fetch.mockImplementation(async () => new Response(PNG_1X1));
    await expect(fetchSafeImage('https://art.example/b.png', AbortSignal.timeout(5000), 10)).rejects.toThrow(
      'Artwork exceeds size limit'
    );
  });
});
