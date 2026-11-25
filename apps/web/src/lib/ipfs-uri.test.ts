import { afterEach, describe, expect, it, vi } from 'vitest';

const originalGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY;

afterEach(() => {
  if (originalGateway === undefined) delete process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  else process.env.NEXT_PUBLIC_PINATA_GATEWAY = originalGateway;
  vi.resetModules();
});

/** The module reads the variable once, when it loads. */
async function load(gateway?: string) {
  if (gateway === undefined) delete process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  else process.env.NEXT_PUBLIC_PINATA_GATEWAY = gateway;
  vi.resetModules();
  return import('./ipfs-uri');
}

describe('IPFS gateway order', () => {
  it("starts at Pinata's public gateway and tries Nouns Builder's dedicated gateway last", async () => {
    const { IPFS_GATEWAYS, DEFAULT_PINATA_GATEWAY } = await load();

    expect(DEFAULT_PINATA_GATEWAY).toBe('gateway.pinata.cloud');
    expect(IPFS_GATEWAYS[0]).toBe('https://gateway.pinata.cloud');
    expect(IPFS_GATEWAYS.at(-1)).toBe('https://nouns-builder.mypinata.cloud');
    expect(new Set(IPFS_GATEWAYS).size).toBe(IPFS_GATEWAYS.length);
  });

  it('tries a configured gateway first, then the public one, without repeating it', async () => {
    const { IPFS_GATEWAYS } = await load('https://tribes.mypinata.cloud/');

    expect(IPFS_GATEWAYS.slice(0, 2)).toEqual(['https://tribes.mypinata.cloud', 'https://gateway.pinata.cloud']);
    expect(new Set(IPFS_GATEWAYS).size).toBe(IPFS_GATEWAYS.length);
  });

  it("turns another gateway's URL into the same path on every gateway", async () => {
    const { getFetchableUrls } = await load();
    const urls = getFetchableUrls('https://nouns-builder.mypinata.cloud/ipfs/bafkreiexample/art/head.png');

    expect(urls?.[0]).toBe('https://gateway.pinata.cloud/ipfs/bafkreiexample/art/head.png');
    expect(urls?.every((url) => url.endsWith('/ipfs/bafkreiexample/art/head.png'))).toBe(true);
  });
});
