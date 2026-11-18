import { warmInkPreset } from '@builder-stellar/design-tokens';
import { defineConfig } from '@pandacss/dev';
import { preset as presetPanda } from '@pandacss/preset-panda';

// The same Warm Ink · Dusk system as the app (packages/design-tokens, DESIGN.md).
// The shared primitives from apps/web are scanned too, so their styles are generated here.
export default defineConfig({
  include: [
    './src/**/*.{ts,tsx,mdx}',
    './content/**/*.mdx',
    '../web/src/components/ui/*.tsx',
    '../web/src/components/shell/brand-mark.tsx'
  ],
  exclude: ['node_modules', '.next', 'out', '../web/src/components/ui/*.test.tsx'],
  outdir: 'styled-system',
  jsxFramework: 'react',
  preflight: true,
  minify: true,
  hash: { className: true, cssVar: false },
  strictPropertyValues: true,
  presets: [presetPanda, warmInkPreset],
  staticCss: { recipes: '*' }
});
