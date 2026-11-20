// The Warm Ink recipes behind the shared primitives in apps/web/src/components/ui
// (Button, Card, Field, Input, Select, Badge, Text, Heading). Both sites render
// those primitives, so the recipes live with the tokens.
import { defineRecipe } from '@pandacss/dev';

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
  // Panda's _invalid matches the native :invalid, so an empty required field showed red before anyone
  // typed (BUG-CAP-19). Flag it only when the app says so, or after the person has interacted.
  '&[aria-invalid=true], &[data-invalid], &:user-invalid': { borderColor: 'danger' },
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

export const recipes = { button, card, field, input, select, badge, text, heading };
