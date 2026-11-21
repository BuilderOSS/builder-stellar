import { warmInkPreset } from '@builder-stellar/design-tokens';
import { defineConfig } from '@pandacss/dev';
import { preset as presetPanda } from '@pandacss/preset-panda';

// Warm Ink · Dusk. DESIGN.md is the specification. Tokens, semantic tokens (light
// `base`, dark `_dark`), conditions, text styles, keyframes and recipes come from the
// shared preset in packages/design-tokens. The boot script in src/lib/warm-ink-theme.ts
// sets [data-theme] before first paint.

export default defineConfig({
  include: ['./src/**/*.{js,jsx,ts,tsx,mdx}'],
  exclude: ['node_modules', '.next'],
  outdir: 'styled-system',
  jsxFramework: 'react',
  preflight: true,
  minify: true,
  // Keep class names hashed but CSS variables readable so legacy globals.css
  // aliases (--canvas, --accent, ...) can point at the token variables.
  hash: { className: true, cssVar: false },
  strictPropertyValues: true,
  presets: [presetPanda, warmInkPreset],
  staticCss: {
    recipes: '*'
  }
});
