import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { IPFS_GATEWAYS } from './ipfs-uri';

export { getFetchableUrls, IPFS_GATEWAYS, ipfsGatewayUrls } from './ipfs-uri';

const IPFS_GATEWAY_HOSTS = new Set(IPFS_GATEWAYS.map((gateway) => new URL(gateway).hostname));

function isPrivateIpv4(address: string) {
  const octets = address.split('.').map(Number);
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return (
    firstHextet < 0x2000 ||
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf)
  );
}

function isPrivateAddress(address: string) {
  return isIP(address) === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
}

export async function assertSafeRemoteUrl(value: string, allowIpfsGateway = false): Promise<string[]> {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Artwork URL must use HTTPS');
  if (url.username || url.password) throw new Error('Artwork URL cannot contain credentials');

  const hostname = url.hostname.toLowerCase();
  if (allowIpfsGateway && !IPFS_GATEWAY_HOSTS.has(hostname)) {
    throw new Error(`Unapproved IPFS gateway: ${hostname}`);
  }

  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`Artwork URL resolves to a private address: ${hostname}`);
  }

  return addresses.map(({ address }) => address);
}
