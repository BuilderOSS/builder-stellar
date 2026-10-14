// The public site (see src/lib/site.ts). NEXT_PUBLIC_SITE_URL overrides it per deployment.
const SITE_URL = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://tribes.build');

// The app's old production host. Testnet tribes deployed before the rename point their on-chain
// image and renderer settings at it, so it keeps serving /api, /images and the other public files
// (docs/DAO_DEPLOYMENT.md). Its pages move permanently to the site. Preview *.vercel.app hosts are
// not matched.
const LEGACY_HOST = 'builder-stellar-web.vercel.app';
const LEGACY_KEPT_PATHS = ['api/', 'images/', 'assets/', 'samples/', '_next/'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: SITE_URL.hostname, pathname: '/images/**' },
      { protocol: 'https', hostname: SITE_URL.hostname, pathname: '/api/render/**' },
      { protocol: 'https', hostname: LEGACY_HOST, pathname: '/images/**' },
      { protocol: 'https', hostname: LEGACY_HOST, pathname: '/api/render/**' }
    ]
  },
  async redirects() {
    return [
      {
        source: `/:path((?!${LEGACY_KEPT_PATHS.map((path) => path.replace('/', '\\/')).join('|')}).*)`,
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: `${SITE_URL.origin}/:path`,
        permanent: true
      }
    ];
  }
};

export default nextConfig;
