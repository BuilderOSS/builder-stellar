import { defineConfig, defineRecipe } from '@pandacss/dev';
import { preset as presetPanda } from '@pandacss/preset-panda';

const button = defineRecipe({
  className: 'button',
  jsx: ['Button'],
  base: {
    alignItems: 'center',
    appearance: 'none',
    borderWidth: '1px',
    borderColor: 'rgba(0,133,255,0.34)',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'inline-flex',
    flexShrink: '0',
    fontWeight: 'semibold',
    gap: '2.5',
    justifyContent: 'center',
    minH: '11',
    outline: '0',
    position: 'relative',
    px: '5',
    fontSize: '0.95rem',
    letterSpacing: '0.01em',
    transitionDuration: '150ms',
    transitionProperty: 'background-color, border-color, color, box-shadow, transform',
    userSelect: 'none',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    shadow: '0 16px 40px rgba(2,6,23,0.26)',
    backdropFilter: 'blur(12px)',
    _hover: {
      transform: 'translateY(-1px)',
      shadow: '0 20px 50px rgba(2,6,23,0.32)'
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
        bg: 'linear-gradient(135deg, #0057b3 0%, #0085ff 46%, #53b1ff 100%)',
        color: 'white',
        borderColor: 'rgba(214,235,255,0.32)',
        shadow: '0 18px 45px rgba(0,133,255,0.34)'
      },
      surface: {
        bg: 'rgba(15,15,14,0.82)',
        borderColor: 'rgba(0,133,255,0.18)',
        color: 'white',
        shadow: 'none',
        _hover: { bg: 'rgba(12,24,40,0.94)', borderColor: 'rgba(0,133,255,0.32)' }
      },
      outline: {
        borderColor: 'rgba(0,133,255,0.22)',
        color: 'white',
        bg: 'transparent',
        shadow: 'none',
        _hover: { bg: 'rgba(0,133,255,0.12)', borderColor: 'rgba(165,217,255,0.34)' }
      },
      plain: {
        color: 'white',
        bg: 'transparent',
        shadow: 'none',
        borderColor: 'transparent',
        _hover: { bg: 'rgba(255,255,255,0.1)' }
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
    borderRadius: '2xl',
    borderWidth: '1px',
    borderColor: 'rgba(0,133,255,0.12)',
    bg: 'linear-gradient(180deg, rgba(18,16,13,0.92) 0%, rgba(9,9,10,0.96) 100%)',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 28px 88px rgba(2,6,23,0.5)',
    color: 'white'
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
    borderColor: 'rgba(0,133,255,0.16)',
    borderRadius: '14px',
    bg: 'rgba(15,23,42,0.98)',
    color: 'white',
    px: '4',
    py: '3',
    outline: 'none',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    transitionProperty: 'border-color, box-shadow, background-color',
    _focusVisible: {
      borderColor: 'accent.500',
      boxShadow: '0 0 0 4px rgba(0,133,255,0.2)'
    }
  }
});

const select = defineRecipe({
  className: 'select',
  jsx: ['Select'],
  base: {
    width: '100%',
    borderWidth: '1px',
    borderColor: 'rgba(0,133,255,0.16)',
    borderRadius: '14px',
    bg: 'rgba(15,23,42,0.98)',
    color: 'white',
    px: '4',
    py: '3',
    outline: 'none',
    shadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    transitionProperty: 'border-color, box-shadow, background-color',
    _focusVisible: {
      borderColor: 'accent.500',
      boxShadow: '0 0 0 4px rgba(0,133,255,0.2)'
    }
  }
});

const badge = defineRecipe({
  className: 'badge',
  jsx: ['Badge'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'full',
    borderWidth: '1px',
    borderColor: 'rgba(0,133,255,0.18)',
    px: '3',
    py: '1.5',
    textStyle: 'xs',
    fontWeight: 'semibold',
    bg: 'rgba(0,133,255,0.16)',
    color: '#e3f1ff'
  }
});

const text = defineRecipe({
  className: 'text',
  jsx: ['Text'],
  base: {
    color: 'rgba(226,232,240,0.92)'
  }
});

const heading = defineRecipe({
  className: 'heading',
  jsx: ['Heading'],
  base: {
    color: 'white',
    fontWeight: 'bold',
    lineHeight: '1'
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
