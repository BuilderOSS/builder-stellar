/**
 * IPFS addresses and the public gateways that serve them. Pure functions with no Node or browser
 * imports, so the client, the server, and the middleware (Content-Security-Policy) share one list.
 */

/**
 * The gateway tried first when `NEXT_PUBLIC_PINATA_GATEWAY` is unset. Pinata's public gateway serves
 * every public file, including the ones this app's uploads pin. A dedicated `*.mypinata.cloud` gateway
 * serves only its own account's files (401, `ERR_ID:00024`, for any other), so set the variable to a
 * dedicated gateway only when it belongs to the account behind `PINATA_JWT`.
 */
export const DEFAULT_PINATA_GATEWAY = 'gateway.pinata.cloud';

export const IPFS_GATEWAYS = [
  ...new Set(
    [
      process.env.NEXT_PUBLIC_PINATA_GATEWAY || DEFAULT_PINATA_GATEWAY,
      DEFAULT_PINATA_GATEWAY,
      'magic.decentralized-content.com',
      'ipfs.io',
      'dweb.link',
      'w3s.link',
      'ipfs.decentralized-content.com',
      // Nouns Builder's dedicated gateway: it serves only files pinned in that account, so it is last.
      'nouns-builder.mypinata.cloud'
    ].map((gateway) => `https://${gateway.replace(/^https?:\/\//, '').replace(/\/$/, '')}`)
  )
];

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[A-Za-z0-9]{50,})$/;

/**
 * The `ipfs://` form of an IPFS address: an `ipfs://` URI, a bare CID, or any URL with an
 * `/ipfs/` path. Only the content path is kept, so a URL's own host is never contacted.
 */
export function normalizeIpfsUri(uri: string): string | undefined {
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

/** The same IPFS content at every gateway, in order of preference. */
export function ipfsGatewayUrls(uri: string): string[] | undefined {
  const normalized = normalizeIpfsUri(uri);
  if (!normalized) return undefined;

  const path = normalized.slice('ipfs://'.length);
  return IPFS_GATEWAYS.map((gateway) => `${gateway}/ipfs/${path}`);
}

/** Gateway URLs for an IPFS address, or the URL itself for any other http(s) address. */
export function getFetchableUrls(uri: string | null | undefined): string[] | undefined {
  if (!uri || typeof uri !== 'string') return undefined;

  const ipfsUrls = ipfsGatewayUrls(uri);
  if (ipfsUrls) return ipfsUrls;

  if (/^https?:\/\//.test(uri)) return [uri];
  return undefined;
}
