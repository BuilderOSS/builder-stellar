// Warm Ink · Dusk. DESIGN.md is the specification; these values must match it.
import { defineTokens } from '@pandacss/dev';

export const tokens = defineTokens({
  fonts: {
    body: { value: 'var(--font-ui), ui-sans-serif, system-ui, sans-serif' },
    heading: { value: 'var(--font-display), var(--font-ui), ui-sans-serif, sans-serif' },
    display: { value: 'var(--font-display), var(--font-ui), ui-sans-serif, sans-serif' },
    mono: { value: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace' }
  },
  radii: {
    control: { value: '10px' },
    card: { value: '16px' },
    sheet: { value: '24px' }
  },
  easings: {
    out: { value: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    inOut: { value: 'cubic-bezier(0.77, 0, 0.175, 1)' },
    drawer: { value: 'cubic-bezier(0.32, 0.72, 0, 1)' }
  },
  durations: {
    fast: { value: '150ms' },
    press: { value: '160ms' },
    pop: { value: '180ms' },
    sheet: { value: '240ms' }
  },
  sizes: {
    rail: { value: '72px' },
    tabbar: { value: '64px' },
    content: { value: '1120px' },
    touch: { value: '44px' }
  },
  zIndex: {
    bar: { value: 40 },
    // The rail floats over the sticky top bar when it widens.
    rail: { value: 41 },
    overlay: { value: 60 },
    toast: { value: 80 }
  }
});
