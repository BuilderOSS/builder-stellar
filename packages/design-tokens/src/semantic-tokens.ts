// Warm Ink · Dusk. DESIGN.md is the specification; these values must match it.
// `base` is the light theme, `_dark` the hero theme (see conditions.ts).
import { defineSemanticTokens } from '@pandacss/dev';

export const semanticTokens = defineSemanticTokens({
  colors: {
    canvas: { value: { base: '#F3EFE8', _dark: '#141311' } },
    surface: { value: { base: '#FBF8F3', _dark: '#1C1A18' } },
    raised: { value: { base: '#FFFFFF', _dark: '#252220' } },
    hover: { value: { base: '#F1ECE4', _dark: '#2D2A27' } },
    rule: {
      DEFAULT: { value: { base: '#DDD6CB', _dark: '#393530' } },
      strong: { value: { base: '#C9C0B2', _dark: '#48433D' } }
    },
    ink: {
      DEFAULT: { value: { base: '#221E19', _dark: '#F3EDE5' } },
      muted: { value: { base: '#5E564C', _dark: '#B3ABA1' } },
      faint: { value: { base: '#8E8578', _dark: '#847C72' } }
    },
    signal: {
      DEFAULT: { value: { base: '#0068D6', _dark: '#0085FF' } },
      wash: { value: { base: 'rgba(0, 104, 214, 0.10)', _dark: 'rgba(0, 133, 255, 0.14)' } },
      edge: { value: { base: 'rgba(0, 104, 214, 0.36)', _dark: 'rgba(0, 133, 255, 0.42)' } }
    },
    primary: {
      DEFAULT: { value: { base: '#0068D6', _dark: '#0070E0' } },
      hover: { value: { base: '#0059B8', _dark: '#0062C4' } },
      fg: { value: '#FFFFFF' }
    },
    brass: {
      DEFAULT: { value: { base: '#9A6A22', _dark: '#D9A35A' } },
      wash: { value: { base: 'rgba(154, 106, 34, 0.12)', _dark: 'rgba(217, 163, 90, 0.14)' } },
      edge: { value: { base: 'rgba(154, 106, 34, 0.34)', _dark: 'rgba(217, 163, 90, 0.36)' } }
    },
    success: {
      DEFAULT: { value: { base: '#2E7A57', _dark: '#4FBA8B' } },
      wash: { value: { base: 'rgba(46, 122, 87, 0.10)', _dark: 'rgba(79, 186, 139, 0.12)' } },
      edge: { value: { base: 'rgba(46, 122, 87, 0.34)', _dark: 'rgba(79, 186, 139, 0.36)' } }
    },
    warning: {
      DEFAULT: { value: { base: '#8F5A12', _dark: '#E2A94F' } },
      wash: { value: { base: 'rgba(143, 90, 18, 0.10)', _dark: 'rgba(226, 169, 79, 0.12)' } },
      edge: { value: { base: 'rgba(143, 90, 18, 0.34)', _dark: 'rgba(226, 169, 79, 0.36)' } }
    },
    danger: {
      DEFAULT: { value: { base: '#B23A48', _dark: '#EF7B87' } },
      wash: { value: { base: 'rgba(178, 58, 72, 0.10)', _dark: 'rgba(239, 123, 135, 0.12)' } },
      edge: { value: { base: 'rgba(178, 58, 72, 0.34)', _dark: 'rgba(239, 123, 135, 0.36)' } }
    },
    scrim: { value: { base: 'rgba(34, 30, 25, 0.42)', _dark: 'rgba(5, 4, 3, 0.66)' } },
    skeleton: { value: { base: 'rgba(34, 30, 25, 0.07)', _dark: 'rgba(243, 237, 229, 0.07)' } },
    imageEdge: { value: { base: 'rgba(0, 0, 0, 0.10)', _dark: 'rgba(255, 255, 255, 0.10)' } }
  },
  shadows: {
    float: {
      value: {
        base: '0 1px 2px rgba(40, 30, 20, 0.06), 0 8px 24px rgba(40, 30, 20, 0.08)',
        _dark: '0 1px 2px rgba(0, 0, 0, 0.40), 0 12px 32px rgba(0, 0, 0, 0.35)'
      }
    },
    raised: {
      value: {
        base: '0 1px 2px rgba(40, 30, 20, 0.05)',
        _dark: '0 1px 2px rgba(0, 0, 0, 0.30)'
      }
    }
  }
});
