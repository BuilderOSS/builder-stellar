import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS adds its own rounded mask, so the tile fills the square. Same glyph as icon.svg.
/* eslint-disable no-restricted-syntax */
export default function AppleIcon() {
  return new ImageResponse(
    <svg width="180" height="180" viewBox="0 0 32 32">
      <rect width="32" height="32" fill="#0068D6" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="2.25" strokeLinejoin="round">
        <rect x="7" y="11.5" width="8" height="8" rx="1.5" />
        <rect x="17.5" y="11.5" width="8" height="8" rx="1.5" />
        <path d="M15 15.5h2.5M7 15.5H4.5v3.5" strokeLinecap="round" />
      </g>
      <rect x="11" y="13.5" width="3" height="4" rx="0.75" fill="#FFFFFF" />
      <rect x="21.5" y="13.5" width="3" height="4" rx="0.75" fill="#FFFFFF" />
    </svg>,
    size
  );
}
/* eslint-enable no-restricted-syntax */
