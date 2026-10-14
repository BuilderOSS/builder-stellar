import { ImageResponse } from 'next/og';

import { BRASS, DUSK, PAPER } from '@/lib/brand-colors';

/**
 * The Dusk tile: the app icon. The gradient lives on the tile only; the glyph stays flat in
 * paper, inset 5/32 at 22/32 size, with its seat filled in brass. `rounded` gives the tile its
 * own corners for icons the platform doesn't mask; leave it square where the OS adds a mask.
 */
export function duskTile(size: number, { rounded = false }: { rounded?: boolean } = {}) {
  return new ImageResponse(
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={DUSK[0]} />
          <stop offset="0.6" stopColor={DUSK[1]} />
          <stop offset="1" stopColor={DUSK[2]} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx={rounded ? 7 : 0} fill="url(#dusk)" />
      <g transform="translate(5 5) scale(0.6875)">
        <path fill={PAPER} fillRule="evenodd" d="M9 9h14v14H9zM11 11v10h5V11z" />
        <circle fill={PAPER} cx="16" cy="3.75" r="3.25" />
        <circle fill={PAPER} cx="28.25" cy="16" r="3.25" />
        <circle fill={PAPER} cx="3.75" cy="16" r="3.25" />
        <circle fill={BRASS} cx="16" cy="28.25" r="3.75" />
      </g>
    </svg>,
    { width: size, height: size }
  );
}
