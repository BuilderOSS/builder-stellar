'use client';

import type { CSSProperties } from 'react';
import { cva, cx } from 'styled-system/css';

import { identityHue, initials } from '@/lib/identity-hue';

import { FallbackImage } from './FallbackImage';

const crest = cva({
  base: {
    position: 'relative',
    display: 'inline-grid',
    placeItems: 'center',
    flexShrink: '0',
    overflow: 'hidden',
    bg: 'hsl(var(--crest-hue) 34% 24%)',
    color: 'hsl(var(--crest-hue) 70% 82%)',
    fontFamily: 'display',
    fontWeight: '700',
    outline: '1px solid',
    outlineColor: 'imageEdge',
    outlineOffset: '-1px',
    _light: { bg: 'hsl(var(--crest-hue) 44% 86%)', color: 'hsl(var(--crest-hue) 50% 30%)' },
    '& img': { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover' }
  },
  variants: {
    size: {
      sm: { width: '7', height: '7', borderRadius: '8px', fontSize: '0.75rem' },
      md: { width: '10', height: '10', borderRadius: '11px', fontSize: '0.875rem' },
      lg: { width: '14', height: '14', borderRadius: '14px', fontSize: '1.125rem' },
      xl: { width: '20', height: '20', borderRadius: '20px', fontSize: '1.5rem' },
      // Fills its container (e.g. an image editor preview).
      fill: { width: '100%', height: '100%', borderRadius: 'card', fontSize: '2.5rem' }
    }
  },
  defaultVariants: { size: 'md' }
});

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export function crestHueStyle(seed: string): CSSProperties {
  return { '--crest-hue': identityHue(seed) } as CSSProperties;
}

/**
 * A community's mark: its image when it has one, otherwise a tinted
 * monogram. `seed` (the token contract id) keeps the tint stable.
 */
export function Crest({
  name,
  seed,
  src,
  size,
  className
}: {
  name: string;
  seed: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  className?: string;
}) {
  return (
    <span className={cx(crest({ size }), className)} style={crestHueStyle(seed)} aria-hidden="true">
      {initials(name)}
      {/* A failed image falls back to a transparent pixel so the monogram shows through. */}
      {src ? <FallbackImage src={src} alt="" errorFallbackSrc={TRANSPARENT_PIXEL} /> : null}
    </span>
  );
}

const stripe = cva({
  base: {
    display: 'block',
    width: '11',
    height: '3px',
    borderRadius: 'full',
    bg: 'hsl(var(--crest-hue) 62% 58%)',
    _light: { bg: 'hsl(var(--crest-hue) 55% 45%)' }
  }
});

/** The community's tint as a thin stripe. Identity without competing with UI colour. */
export function CrestStripe({ seed, className }: { seed: string; className?: string }) {
  return <span className={cx(stripe(), className)} style={crestHueStyle(seed)} aria-hidden="true" />;
}
