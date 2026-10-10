import { defineConfig, defineRecipe, defineSemanticTokens, defineTextStyles, defineTokens } from '@pandacss/dev';
import { preset as presetPanda } from '@pandacss/preset-panda';

// Warm Ink · Dusk. DESIGN.md is the specification; these values must match it.
// `base` is the light theme, `_dark` the hero theme. The boot script in
// src/lib/warm-ink-theme.ts sets [data-theme] before first paint.

const tokens = defineTokens({
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
    overlay: { value: 60 },
    toast: { value: 80 }
  }
});

const semanticTokens = defineSemanticTokens({
  colors: {
    canvas: { value: { base: '#F3EFE8', _dark: '#15120F' } },
    surface: { value: { base: '#FBF8F3', _dark: '#1D1915' } },
    raised: { value: { base: '#FFFFFF', _dark: '#26211C' } },
    hover: { value: { base: '#F1ECE4', _dark: '#2E2822' } },
    rule: {
      DEFAULT: { value: { base: '#DDD6CB', _dark: '#3A322A' } },
      strong: { value: { base: '#C9C0B2', _dark: '#4A4036' } }
    },
    ink: {
      DEFAULT: { value: { base: '#221E19', _dark: '#F3EDE5' } },
      muted: { value: { base: '#5E564C', _dark: '#B6AA9C' } },
      faint: { value: { base: '#8E8578', _dark: '#857A6D' } }
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

const textStyles = defineTextStyles({
  display: {
    value: {
      fontFamily: 'display',
      fontWeight: '700',
      fontSize: 'clamp(2rem, 5vw, 3rem)',
      lineHeight: '1.04',
      letterSpacing: '-0.02em'
    }
  },
  title: {
    value: {
      fontFamily: 'display',
      fontWeight: '600',
      fontSize: '1.5rem',
      lineHeight: '1.15',
      letterSpacing: '-0.015em'
    }
  },
  heading: {
    value: {
      fontFamily: 'display',
      fontWeight: '600',
      fontSize: '1.25rem',
      lineHeight: '1.2',
      letterSpacing: '-0.01em'
    }
  },
  subheading: {
    value: { fontFamily: 'body', fontWeight: '600', fontSize: '1.0625rem', lineHeight: '1.35' }
  },
  body: { value: { fontFamily: 'body', fontWeight: '400', fontSize: '0.9375rem', lineHeight: '1.5' } },
  label: { value: { fontFamily: 'body', fontWeight: '600', fontSize: '0.8125rem', lineHeight: '1.35' } },
  caption: { value: { fontFamily: 'body', fontWeight: '400', fontSize: '0.8125rem', lineHeight: '1.4' } },
  micro: { value: { fontFamily: 'body', fontWeight: '600', fontSize: '0.75rem', lineHeight: '1.3' } },
  mono: {
    value: { fontFamily: 'mono', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '0' }
  }
});

const pressable = {
  transitionProperty: 'background-color, border-color, color, box-shadow, scale',
  transitionDuration: 'press',
  transitionTimingFunction: 'out',
  _active: { scale: '0.96' },
  '&[data-static], &[aria-busy=true], &:disabled': { scale: '1' },
  '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } }
} as const;

const button = defineRecipe({
  className: 'button',
  jsx: ['Button'],
  base: {
    ...pressable,
    alignItems: 'center',
    appearance: 'none',
    borderWidth: '1px',
    borderColor: 'transparent',
    borderRadius: 'control',
    cursor: 'pointer',
    display: 'inline-flex',
    flexShrink: '0',
    fontFamily: 'body',
    fontWeight: '600',
    gap: '2',
    justifyContent: 'center',
    minH: 'touch',
    outline: '0',
    position: 'relative',
    px: '4',
    fontSize: '0.9375rem',
    userSelect: 'none',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    _disabled: { opacity: '0.5', cursor: 'not-allowed' },
    _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
    '& svg': { flexShrink: '0', width: '1.125em', height: '1.125em' }
  },
  variants: {
    variant: {
      primary: {
        bg: 'primary',
        color: 'primary.fg',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'primary.hover' } }
      },
      secondary: {
        bg: 'raised',
        color: 'ink',
        borderColor: 'rule',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', borderColor: 'rule.strong' } }
      },
      ghost: {
        bg: 'transparent',
        color: 'ink.muted',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', color: 'ink' } }
      },
      link: {
        bg: 'transparent',
        color: 'signal',
        px: '0',
        minH: 'auto',
        '@media (hover: hover) and (pointer: fine)': { _hover: { textDecoration: 'underline' } }
      },
      danger: {
        bg: 'transparent',
        color: 'danger',
        borderColor: 'danger.edge',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'danger.wash' } }
      },
      // Legacy aliases, removed once every screen is migrated (Phase 4).
      solid: {
        bg: 'primary',
        color: 'primary.fg',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'primary.hover' } }
      },
      surface: {
        bg: 'raised',
        color: 'ink',
        borderColor: 'rule',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } }
      },
      outline: {
        bg: 'raised',
        color: 'ink',
        borderColor: 'rule',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', borderColor: 'rule.strong' } }
      },
      plain: {
        bg: 'transparent',
        color: 'ink.muted',
        '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', color: 'ink' } }
      }
    },
    size: {
      sm: { minH: '9', px: '3', fontSize: '0.875rem', '@media (pointer: coarse)': { minH: 'touch' } },
      md: { minH: 'touch', px: '4' },
      lg: { minH: '12', px: '5', fontSize: '1rem' }
    },
    iconOnly: {
      true: { px: '0', minW: 'touch', aspectRatio: '1' }
    },
    block: {
      true: { width: '100%' }
    }
  },
  compoundVariants: [{ size: 'sm', iconOnly: true, css: { minW: '9', '@media (pointer: coarse)': { minW: 'touch' } } }],
  defaultVariants: {
    variant: 'primary',
    size: 'md'
  }
});

const card = defineRecipe({
  className: 'card',
  jsx: ['Card'],
  base: {
    p: { base: '4', md: '5' },
    borderRadius: 'card',
    bg: 'surface',
    color: 'ink',
    boxShadow: 'raised'
  },
  variants: {
    tone: {
      surface: {},
      raised: { bg: 'raised' },
      yours: { bg: 'surface', boxShadow: 'inset 0 0 0 1px token(colors.brass.edge)' },
      flat: { boxShadow: 'none', bg: 'transparent', p: '0' }
    }
  },
  defaultVariants: { tone: 'surface' }
});

const field = defineRecipe({
  className: 'field',
  jsx: ['Field'],
  base: {
    display: 'grid',
    gap: '1.5'
  }
});

const control = {
  width: '100%',
  borderWidth: '1px',
  borderColor: 'rule',
  borderRadius: 'control',
  bg: 'raised',
  color: 'ink',
  fontFamily: 'body',
  fontSize: '0.9375rem',
  px: '3.5',
  py: '2.5',
  outline: 'none',
  minH: 'touch',
  transitionProperty: 'border-color, box-shadow, background-color',
  transitionDuration: 'fast',
  transitionTimingFunction: 'out',
  _placeholder: { color: 'ink.faint' },
  _hover: { borderColor: 'rule.strong' },
  _disabled: { opacity: '0.55', cursor: 'not-allowed', bg: 'hover' },
  _invalid: { borderColor: 'danger' },
  _focusVisible: { borderColor: 'signal', boxShadow: '0 0 0 3px token(colors.signal.wash)' }
} as const;

const input = defineRecipe({ className: 'input', jsx: ['Input'], base: control });

const select = defineRecipe({ className: 'select', jsx: ['Select'], base: { ...control, pr: '9' } });

const badge = defineRecipe({
  className: 'badge',
  jsx: ['Badge'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1.5',
    borderRadius: 'full',
    px: '2.5',
    py: '0.5',
    minH: '6',
    textStyle: 'micro',
    whiteSpace: 'nowrap',
    bg: 'hover',
    color: 'ink.muted',
    '& svg': { width: '0.875rem', height: '0.875rem', flexShrink: '0' }
  },
  variants: {
    tone: {
      neutral: {},
      live: { bg: 'signal.wash', color: 'signal' },
      yours: { bg: 'brass.wash', color: 'brass' },
      success: { bg: 'success.wash', color: 'success' },
      warning: { bg: 'warning.wash', color: 'warning' },
      danger: { bg: 'danger.wash', color: 'danger' },
      outline: { bg: 'transparent', boxShadow: 'inset 0 0 0 1px token(colors.rule)' }
    }
  },
  defaultVariants: { tone: 'neutral' }
});

const text = defineRecipe({
  className: 'text',
  jsx: ['Text'],
  base: {
    color: 'ink.muted',
    textStyle: 'body',
    margin: '0'
  },
  variants: {
    tone: {
      muted: {},
      default: { color: 'ink' },
      faint: { color: 'ink.faint' },
      danger: { color: 'danger' }
    },
    size: {
      md: {},
      sm: { textStyle: 'caption' },
      lg: { fontSize: '1.0625rem' }
    }
  },
  defaultVariants: { tone: 'muted', size: 'md' }
});

const heading = defineRecipe({
  className: 'heading',
  jsx: ['Heading'],
  base: {
    color: 'ink',
    margin: '0',
    textWrap: 'balance'
  },
  variants: {
    size: {
      display: { textStyle: 'display' },
      title: { textStyle: 'title' },
      heading: { textStyle: 'heading' },
      subheading: { textStyle: 'subheading' }
    }
  },
  defaultVariants: { size: 'heading' }
});

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
  presets: [presetPanda],
  conditions: {
    extend: {
      dark: '[data-theme=dark] &',
      light: '[data-theme=light] &'
    }
  },
  staticCss: {
    recipes: '*'
  },
  theme: {
    extend: {
      breakpoints: { sm: '480px' },
      recipes: { button, card, field, input, select, badge, text, heading },
      tokens,
      semanticTokens,
      textStyles,
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
        sheetUpIn: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        sheetUpOut: { from: { transform: 'translateY(0)' }, to: { transform: 'translateY(100%)' } },
        sheetLeftIn: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        sheetLeftOut: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(100%)' } },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        popOut: {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.98)' }
        },
        voteLand: {
          from: { opacity: '0', transform: 'translateY(-10px) scale(0.9)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' }
        }
      }
    }
  }
});
