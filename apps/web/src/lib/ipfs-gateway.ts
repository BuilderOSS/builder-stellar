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
