import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_PINATA_GATEWAY = 'nouns-builder.mypinata.cloud';

export const IPFS_GATEWAYS = [
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || DEFAULT_PINATA_GATEWAY,
  'ipfs.io',
  'magic.decentralized-content.com',
  'dweb.link',
  'gateway.pinata.cloud',
  'w3s.link',
  'ipfs.decentralized-content.com'
].map((gateway) => `https://${gateway.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[A-Za-z0-9]{50,})$/;

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

function normalizeIpfsUri(uri: string): string | undefined {
  const value = uri.replace(/"/g, '');

  if (value.startsWith('ipfs://')) return value;
  if (CID_PATTERN.test(value)) return `ipfs://${value}`;

  try {
    const parsed = new URL(value);
    const marker = '/ipfs/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return undefined;

    const path = `${parsed.pathname.slice(markerIndex + marker.length)}${parsed.search}${parsed.hash}`;
    return `ipfs://${path}`;
  } catch {
    return undefined;
  }
}

export function ipfsGatewayUrls(uri: string): string[] | undefined {
  const normalized = normalizeIpfsUri(uri);
  if (!normalized) return undefined;

  const path = normalized.slice('ipfs://'.length);
  return IPFS_GATEWAYS.map((gateway) => `${gateway}/ipfs/${path}`);
}

export function getFetchableUrls(uri: string | null | undefined): string[] | undefined {
  if (!uri || typeof uri !== 'string') return undefined;

  const ipfsUrls = ipfsGatewayUrls(uri);
  if (ipfsUrls) return ipfsUrls;

  if (/^https?:\/\//.test(uri)) return [uri];
  return undefined;
}
