import sharp from 'sharp';

import { getFetchableUrls } from '@/lib/ipfs-gateway';
import { fetchPublicUrl, readCapped, withSignal } from '@/lib/safe-remote-fetch';

// Remote images (token layers, tribe images) fetched on the server. Every hop is checked against
// private addresses and pinned to the address that was checked, redirects are followed by hand
// (fetchPublicUrl), and size and format are capped. Used by /api/render and the share cards.

export { withSignal };

export const MAX_INPUT_PIXELS = 16_777_216;
const ALLOWED_IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp']);

export async function fetchSafeImage(uri: string, signal: AbortSignal, maxBytes: number) {
  const urls = getFetchableUrls(uri);
  if (!urls?.length) throw new Error(`Unsupported artwork URL: ${uri}`);

  let lastError: Error | undefined;
  for (let urlIndex = 0; urlIndex < urls.length; urlIndex += 1) {
    try {
      const image = await fetchPublicUrl(urls[urlIndex], signal, async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return readCapped(response, maxBytes, 'Artwork exceeds size limit');
      });
      const metadata = await withSignal(sharp(image, { limitInputPixels: MAX_INPUT_PIXELS }).metadata(), signal);
      if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
        throw new Error('Unsupported artwork format');
      }
      return image;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Artwork fetch failed');
      if (urlIndex === urls.length - 1) break;
    }
  }
  throw lastError || new Error('Artwork fetch failed');
}
