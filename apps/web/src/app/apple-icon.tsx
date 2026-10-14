import { duskTile } from '@/lib/brand-tile';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS adds its own rounded mask, so the Dusk tile fills the square.
export default function AppleIcon() {
  return duskTile(size.width);
}
