// Warm Ink · Dusk. DESIGN.md is the specification; these values must match it.
import { defineTextStyles } from '@pandacss/dev';

export const textStyles = defineTextStyles({
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
