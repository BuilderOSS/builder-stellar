/**
 * The Content-Security-Policy for pages, built per request by src/middleware.ts.
 *
 * Scripts run only with the request's nonce ('strict-dynamic' lets those scripts load the app's
 * chunks), so injected markup can't run script. The other directives list what the app and the
 * wallet kit load. The policy is report-only until CSP_MODE=enforce (docs/SECURITY_MODEL.md,
 * "Response headers"); until then next.config.mjs enforces a smaller baseline.
 */
import { type NetworkName, NETWORKS } from '@/config/networks';
import { IPFS_GATEWAYS } from '@/lib/ipfs-uri';
import { LEGACY_SITE_ORIGIN, siteUrl } from '@/lib/site';

export { BASELINE_CONTENT_SECURITY_POLICY, cspMode } from '../../security-headers.mjs';

/** Where browsers send violation reports (rate limited; logged on the server). */
export const CSP_REPORT_PATH = '/api/csp-report';

/** 128 random bits, base64: a fresh nonce for one response. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

const HORIZON: Partial<Record<NetworkName, string>> = {
  testnet: 'https://horizon-testnet.stellar.org',
  public: 'https://horizon.stellar.org'
};

// Hosts the wallet kit and its wallets use: icons, the WalletConnect relay and modal, the frames
// Albedo, Trezor and HOT open, and HOT's request relay.
const WALLET_KIT_IMAGES = [
  'https://stellar.creit.tech',
  'https://scopuly.com',
  'https://storage.herewallet.app',
  'https://uni.onekey-asset.com'
];
const WALLET_FRAMES = ['https://albedo.link', 'https://connect.trezor.io', 'https://hot-labs.org'];
const WALLET_CONNECTIONS = ['https://h4n.app'];
const WALLETCONNECT = {
  connect: [
    'https://*.walletconnect.com',
    'https://*.walletconnect.org',
    'wss://*.walletconnect.com',
    'wss://*.walletconnect.org',
    'https://*.web3modal.com',
    'https://*.web3modal.org',
    'https://*.reown.com'
  ],
  images: [
    'https://*.walletconnect.com',
    'https://*.walletconnect.org',
    'https://*.web3modal.com',
    'https://*.web3modal.org',
    'https://*.reown.com'
  ],
  fonts: ['https://fonts.reown.com'],
  frames: [
    'https://verify.walletconnect.com',
    'https://verify.walletconnect.org',
    'https://secure.walletconnect.com',
    'https://secure.walletconnect.org'
  ]
};
// The browser uploads straight to Pinata with a signed URL or a short-lived key.
const PINATA_UPLOADS = ['https://uploads.pinata.cloud', 'https://api.pinata.cloud'];

/** Each gateway and its subdomains: path gateways redirect to `<cid>.ipfs.<gateway>`. */
function gatewaySources() {
  return IPFS_GATEWAYS.flatMap((gateway) => {
    const host = new URL(gateway).host;
    return [`https://${host}`, `https://*.${host}`];
  });
}

function origin(url: string | undefined) {
  if (!url) return [];
  try {
    return [new URL(url).origin];
  } catch {
    return [];
  }
}

export type CspOptions = {
  nonce: string;
  network: NetworkName;
  /** Development server: React refresh needs eval, and HMR and dev tools connect locally. */
  dev: boolean;
  walletConnect: boolean;
  /** Ask the browser to load every subresource over HTTPS (enforced policies on HTTPS pages only). */
  upgradeInsecureRequests: boolean;
};

/** The page policy for one response. */
export function buildContentSecurityPolicy({
  nonce,
  network,
  dev,
  walletConnect,
  upgradeInsecureRequests
}: CspOptions): string {
  const config = NETWORKS[network] ?? NETWORKS.testnet;
  const gateways = gatewaySources();
  const wc = walletConnect ? WALLETCONNECT : { connect: [], images: [], fonts: [], frames: [] };
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    // The wallet kit and its modal inject style elements at runtime.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    // Member-written Markdown loads images only from IPFS (components/ui/markdown.tsx). Tribe
    // images and artwork may also sit on the public site (which redirects to its www host) or its
    // old host (next.config.mjs images).
    [
      'img-src',
      [
        "'self'",
        'data:',
        'blob:',
        siteUrl().origin,
        `https://*.${siteUrl().host}`,
        LEGACY_SITE_ORIGIN,
        ...gateways,
        ...WALLET_KIT_IMAGES,
        ...wc.images
      ]
    ],
    ['font-src', ["'self'", 'data:', ...wc.fonts]],
    [
      'connect-src',
      [
        "'self'",
        ...origin(config.rpcUrl),
        ...origin(HORIZON[config.name]),
        ...gateways,
        ...PINATA_UPLOADS,
        ...WALLET_CONNECTIONS,
        ...wc.connect,
        // The HMR socket and local dev tools (the Agentation toolbar).
        ...(dev ? ['ws:', 'http://localhost:*', 'ws://localhost:*'] : [])
      ]
    ],
    ['frame-src', [...WALLET_FRAMES, ...wc.frames]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ['report-uri', [CSP_REPORT_PATH]]
  ];
  const policy = directives.map(([name, sources]) => `${name} ${[...new Set(sources)].join(' ')}`);
  if (upgradeInsecureRequests) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
