import { fileURLToPath } from 'node:url';

import createMDX from '@next/mdx';

// docs.tribes.build: a fully static export (out/), indexed by Pagefind after the build.
// The app's own ui primitives are reused from apps/web (package export ./ui/*), never
// copied; they import `styled-system/*`, which resolves to this app's generated system.
const styledSystem = fileURLToPath(new URL('./styled-system', import.meta.url));

const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: ['rehype-slug']
  }
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['@builder-stellar/design-tokens', '@builder-stellar/glossary', '@builder-stellar/web'],
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, 'styled-system': styledSystem };
    return config;
  }
};

export default withMDX(nextConfig);
