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
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'inline-flex',
    flexShrink: '0',
    fontWeight: 'semibold',
    gap: '2',
    justifyContent: 'center',
    minH: '11',
    outline: '0',
    position: 'relative',
    px: '5',
    fontSize: '0.9rem',
    letterSpacing: '-0.01em',
    transitionDuration: '160ms',
    transitionProperty: 'background-color, border-color, color, box-shadow, transform',
    userSelect: 'none',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    shadow: 'none',
    _hover: {
      transform: 'translateY(-1px)'
    },
    _active: {
      transform: 'translateY(0px) scale(0.99)'
    },
    _disabled: {
      opacity: '0.5',
      cursor: 'not-allowed',
      transform: 'none',
      shadow: 'none'
    },
    focusVisibleRing: 'outside'
  },
  variants: {
    variant: {
      solid: {
        bg: 'var(--action)',
        color: 'white',
        borderColor: 'var(--action)',
        _hover: { bg: 'var(--action-hover)', borderColor: 'var(--action-hover)' }
      },
      surface: {
        bg: 'var(--surface-2)',
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
      sm: { h: '10', minW: '10', textStyle: 'sm', px: '4' },
      md: { h: '11', minW: '11', textStyle: 'sm', px: '5' },
      lg: { h: '12', minW: '12', textStyle: 'md', px: '6' }
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
    borderRadius: '20px',
    borderWidth: '1px',
    borderColor: 'var(--border-default)',
    bg: 'var(--surface-1)',
    boxShadow: '0 1px 0 rgba(255, 255, 255, 0.025)',
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
    borderColor: 'var(--border-strong)',
    borderRadius: '10px',
    bg: 'var(--surface-0)',
    color: 'var(--text-primary)',
    px: '4',
    py: '3',
    outline: 'none',
    minH: '11',
    shadow: 'none',
    transitionProperty: 'border-color, box-shadow, background-color',
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
    borderColor: 'var(--border-strong)',
    borderRadius: '10px',
    bg: 'var(--surface-0)',
    color: 'var(--text-primary)',
    px: '4',
    py: '3',
    outline: 'none',
    minH: '11',
    shadow: 'none',
    transitionProperty: 'border-color, box-shadow, background-color',
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
    borderRadius: '8px',
    borderWidth: '1px',
    borderColor: 'var(--border-default)',
    px: '3',
    py: '1.5',
    textStyle: 'xs',
    fontWeight: 'semibold',
    bg: 'var(--surface-2)',
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
          accent: {
            50: { value: '#eaf4ff' },
            100: { value: '#d9ecff' },
            200: { value: '#b7ddff' },
            300: { value: '#8eccff' },
            400: { value: '#5fb3ff' },
            500: { value: '#0085ff' },
            600: { value: '#006fe0' },
            700: { value: '#0057b3' },
            800: { value: '#00458f' },
            900: { value: '#00366f' },
            950: { value: '#00284f' }
          }
        }
      }
    }
  }
});
