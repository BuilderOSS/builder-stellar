import type { CSSProperties } from 'react';
import { cva, cx } from 'styled-system/css';

import { identiconCells, identityHue } from '@/lib/identity-hue';

const avatar = cva({
  base: {
    display: 'inline-grid',
    placeItems: 'center',
    flexShrink: '0',
    borderRadius: 'full',
    overflow: 'hidden',
    outline: '1px solid',
    outlineColor: 'imageEdge',
    outlineOffset: '-1px',
    bg: 'hsl(var(--avatar-hue) 32% 26%)',
    _light: { bg: 'hsl(var(--avatar-hue) 40% 88%)' },
    '& svg': { width: '64%', height: '64%' },
    '& rect': { fill: 'hsl(var(--avatar-hue) 62% 66%)', _light: { fill: 'hsl(var(--avatar-hue) 52% 42%)' } }
  },
  variants: {
    size: {
      xs: { width: '5', height: '5' },
      sm: { width: '7', height: '7' },
      md: { width: '9', height: '9' },
      lg: { width: '12', height: '12' }
    },
    yours: {
      true: { boxShadow: '0 0 0 2px token(colors.brass)' }
    }
  },
  defaultVariants: { size: 'md' }
});

/**
 * Deterministic identicon for a Stellar address. Accounts have no profile
 * pictures, so the same address always looks the same everywhere.
 */
export function Avatar({
  address,
  size,
  yours,
  label,
  className
}: {
  address: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  yours?: boolean;
  /** Accessible name; omit when a visible name sits next to the avatar. */
  label?: string;
  className?: string;
}) {
  const cells = identiconCells(address);
  return (
    <span
      className={cx(avatar({ size, yours }), className)}
      style={{ '--avatar-hue': identityHue(address) } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true">
        {cells.map((filled, index) =>
          filled ? <rect key={index} x={index % 5} y={Math.floor(index / 5)} width="1" height="1" /> : null
        )}
      </svg>
    </span>
  );
}

const stack = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    '& > *:not(:first-child)': { ml: '-1.5' },
    '& > *': { boxShadow: '0 0 0 2px token(colors.surface)' }
  }
});

export function AvatarStack({
  addresses,
  max = 4,
  size = 'sm'
}: {
  addresses: string[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}) {
  const shown = addresses.slice(0, max);
  return (
    <span className={stack()}>
      {shown.map((address) => (
        <Avatar key={address} address={address} size={size} />
      ))}
    </span>
  );
}
