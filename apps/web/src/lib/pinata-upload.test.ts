import { afterEach, describe, expect, it } from 'vitest';

import { cidToUrls, getPreferredGatewayHost, normalizeIpfsCid } from './pinata-upload';

const originalGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY;

afterEach(() => {
  if (originalGateway === undefined) {
    delete process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  } else {
    process.env.NEXT_PUBLIC_PINATA_GATEWAY = originalGateway;
  }
});

describe('IPFS upload URLs', () => {
  it('normalizes bare and ipfs-prefixed CIDs', () => {
    expect(normalizeIpfsCid('bafybeigdyrzt3testcid')).toBe('bafybeigdyrzt3testcid');
    expect(normalizeIpfsCid('ipfs://bafybeigdyrzt3testcid')).toBe('bafybeigdyrzt3testcid');
    expect(normalizeIpfsCid('https://example.com/image.png')).toBeNull();
    expect(normalizeIpfsCid('ipfs://bafytest/image.png')).toBeNull();
  });

  it('uses the configured gateway for finalized URLs', () => {
    process.env.NEXT_PUBLIC_PINATA_GATEWAY = 'custom.example.com';

    expect(getPreferredGatewayHost()).toBe('custom.example.com');
    expect(cidToUrls('bafytest', getPreferredGatewayHost())).toEqual({
      ipfsUri: 'ipfs://bafytest',
      gatewayUrl: 'https://custom.example.com/ipfs/bafytest'
    });
  });

  it('falls back to the default gateway when none is configured', () => {
    delete process.env.NEXT_PUBLIC_PINATA_GATEWAY;

    expect(cidToUrls('bafytest')).toEqual({
      ipfsUri: 'ipfs://bafytest',
      gatewayUrl: 'https://nouns-builder.mypinata.cloud/ipfs/bafytest'
    });
  });
});
