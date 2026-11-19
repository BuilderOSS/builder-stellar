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
  // The walkthrough suite (apps/e2e) builds into its own directory so it never overwrites `.next`.
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  // Always defined, so `process.env.NEXT_PUBLIC_E2E_WALLET === '1'` in src/lib/wallet-kit.ts folds to a
  // constant and the bundler drops the test-only wallet. Next inlines a NEXT_PUBLIC_ variable only when
  // it is set; left unset, the guard stayed a runtime check and the module shipped (BUG-002).
  env: { NEXT_PUBLIC_E2E_WALLET: process.env.NEXT_PUBLIC_E2E_WALLET === '1' ? '1' : '0' },
  typedRoutes: true,
  // Shared Warm Ink fonts run through the Next font loader (packages/design-tokens).
  transpilePackages: ['@builder-stellar/design-tokens'],
  // Share cards read their OFL fonts from disk (src/lib/og/fonts.ts); tracing can't see that path.
  outputFileTracingIncludes: {
    '/opengraph-image': ['./src/assets/fonts/**'],
    '/**/opengraph-image': ['./src/assets/fonts/**']
  },
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
