import { defineConfig, defineRecipe } from '@pandacss/dev';
import { preset as presetPanda } from '@pandacss/preset-panda';

const button = defineRecipe({
  className: 'button',
  jsx: ['Button'],
  base: {
    alignItems: 'center',
    appearance: 'none',
    borderWidth: '1px',
    borderColor: 'var(--border-strong)',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
    display: 'inline-flex',
    flexShrink: '0',
    fontWeight: 'semibold',
    gap: '2',
    justifyContent: 'center',
    minH: '10',
    outline: '0',
    position: 'relative',
    px: '4',
    fontSize: '0.875rem',
    letterSpacing: '-0.01em',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
    transitionProperty: 'background-color, border-color, color, box-shadow, scale',
    userSelect: 'none',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    shadow: 'none',
    _active: {
      scale: '0.96'
    },
    _disabled: {
      opacity: '0.5',
      cursor: 'not-allowed',
      scale: '1',
      shadow: 'none'
    },
    _focusVisible: { outline: '2px solid var(--focus)', outlineOffset: '3px' },
    '&[data-static], &[aria-busy=true]': { scale: '1' },
    '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } },
    '@media (pointer: coarse)': { minH: '11', minW: '11' },
    '@media (max-width: 680px)': { minH: '11', minW: '11' },
    '& svg': { flexShrink: '0', strokeWidth: '2' }
  },
  variants: {
    variant: {
      solid: {
        bg: 'var(--action)',
        color: 'var(--accent-ink)',
        borderColor: 'var(--action)',
        _hover: { bg: 'var(--action-hover)', borderColor: 'var(--action-hover)' }
      },
      surface: {
        bg: 'var(--surface)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-primary)',
        shadow: 'none',
        _hover: { bg: 'var(--surface-3)', borderColor: 'var(--border-strong)' }
      },
      outline: {
        borderColor: 'var(--border-strong)',
        color: 'var(--text-primary)',
        bg: 'transparent',
        shadow: 'none',
        _hover: { bg: 'var(--surface-2)', borderColor: 'var(--text-tertiary)' }
      },
      plain: {
        color: 'var(--text-secondary)',
        bg: 'transparent',
        shadow: 'none',
        borderColor: 'transparent',
        _hover: { bg: 'var(--surface-2)', color: 'var(--text-primary)' }
      }
    },
    size: {
      sm: { h: '9', minW: '9', textStyle: 'sm', px: '3' },
      md: { h: '10', minW: '10', textStyle: 'sm', px: '4' },
      lg: { h: '12', minW: '12', textStyle: 'md', px: '5' }
    }
  },
  defaultVariants: {
    variant: 'solid',
    size: 'md'
  }
});

const card = defineRecipe({
  className: 'card',
  jsx: ['Card'],
  base: {
    p: '6',
    borderRadius: 'var(--radius-panel)',
    borderWidth: '1px',
    borderColor: 'var(--border-default)',
    bg: 'var(--surface-1)',
    boxShadow: 'inset 0 1px 0 var(--float-highlight)',
    color: 'var(--text-primary)'
  }
});

const field = defineRecipe({
  className: 'field',
  jsx: ['Field'],
  base: {
    display: 'grid',
    gap: '8px'
  }
});

const input = defineRecipe({
  className: 'input',
  jsx: ['Input'],
  base: {
    width: '100%',
    borderWidth: '1px',
    borderColor: 'var(--rule)',
    borderRadius: 'var(--radius-control)',
    bg: 'var(--surface-raised)',
    color: 'var(--text-primary)',
    px: '4',
    py: '2.5',
    outline: 'none',
    minH: '11',
    shadow: 'none',
    transitionProperty: 'border-color, box-shadow, background-color',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
    _placeholder: { color: 'var(--muted)', opacity: '0.85' },
    _hover: { borderColor: 'var(--border-strong)' },
    _disabled: { opacity: '0.55', cursor: 'not-allowed', bg: 'var(--surface-hover)' },
    _invalid: { borderColor: 'var(--danger)', outlineColor: 'var(--danger)' },
    _focusVisible: {
      borderColor: 'var(--focus)',
      boxShadow: '0 0 0 3px var(--focus-soft)'
    }
  }
});

const select = defineRecipe({
  className: 'select',
  jsx: ['Select'],
  base: {
    width: '100%',
    borderWidth: '1px',
    borderColor: 'var(--rule)',
    borderRadius: 'var(--radius-control)',
    bg: 'var(--surface-raised)',
    color: 'var(--text-primary)',
    px: '4',
    py: '2.5',
    outline: 'none',
    minH: '11',
    shadow: 'none',
    transitionProperty: 'border-color, box-shadow, background-color',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
    _hover: { borderColor: 'var(--border-strong)' },
    _disabled: { opacity: '0.55', cursor: 'not-allowed', bg: 'var(--surface-hover)' },
    _invalid: { borderColor: 'var(--danger)' },
    _focusVisible: {
      borderColor: 'var(--focus)',
      boxShadow: '0 0 0 3px var(--focus-soft)'
    }
  }
});

const badge = defineRecipe({
  className: 'badge',
  jsx: ['Badge'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '6px',
    borderWidth: '1px',
    borderColor: 'var(--border-default)',
    px: '2',
    py: '1',
    textStyle: 'xs',
    fontWeight: 'semibold',
    bg: 'var(--surface-hover)',
    color: 'var(--text-secondary)',
    letterSpacing: '0.01em'
  }
});

const text = defineRecipe({
  className: 'text',
  jsx: ['Text'],
  base: {
    color: 'var(--text-secondary)',
    lineHeight: '1.55'
  }
});

const heading = defineRecipe({
  className: 'heading',
  jsx: ['Heading'],
  base: {
    color: 'var(--text-primary)',
    fontWeight: 'bold',
    lineHeight: '1.1',
    letterSpacing: '-0.035em'
  }
});

export default defineConfig({
  include: ['./src/**/*.{js,jsx,ts,tsx,mdx}'],
  exclude: ['node_modules', '.next'],
  outdir: 'styled-system',
  jsxFramework: 'react',
  preflight: true,
  minify: true,
  hash: true,
  strictPropertyValues: true,
  presets: [presetPanda],
  staticCss: {
    recipes: '*'
  },
  theme: {
    extend: {
      recipes: { button, card, field, input, select, badge, text, heading },
      tokens: {
        colors: {
          canvas: { value: 'var(--canvas)' },
          surface: { value: 'var(--surface)' },
          raised: { value: 'var(--surface-raised)' },
          ink: { value: 'var(--ink)' },
          muted: { value: 'var(--muted)' },
          rule: { value: 'var(--rule)' },
          accent: {
            50: { value: 'var(--accent-wash)' },
            100: { value: 'var(--accent-wash)' },
            200: { value: 'var(--accent-edge)' },
            300: { value: 'var(--accent-edge)' },
            400: { value: 'var(--accent)' },
            500: { value: 'var(--accent)' },
            600: { value: 'var(--accent)' },
            700: { value: 'var(--accent-strong)' },
            800: { value: 'var(--accent-strong)' },
            900: { value: 'var(--ink)' },
            950: { value: 'var(--ink)' }
          }
        },
        fonts: {
          body: { value: 'var(--font-family-ui)' },
          heading: { value: 'var(--font-family-ui)' },
          display: { value: 'var(--font-family-display)' }
        }
      }
    }
  }
});
