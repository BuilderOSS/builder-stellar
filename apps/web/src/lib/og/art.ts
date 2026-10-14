import sharp from 'sharp';

import { GET as renderToken } from '@/app/api/render/[daoId]/[tokenId]/route';
import { fetchSafeImage, MAX_INPUT_PIXELS } from '@/lib/safe-image-fetch';
import { siteHref } from '@/lib/site';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

function timeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function toDataUrl(image: Buffer | ArrayBuffer, size: number, pixelated: boolean): Promise<string> {
  const png = await sharp(Buffer.from(image as ArrayBuffer), { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(size, size, { fit: 'cover', kernel: pixelated ? 'nearest' : 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** A tribe image (https or ipfs) as a small PNG data URL, or null if it can't be loaded in time. */
export async function remoteArt(uri: string | null | undefined, size = 400, ms = 5000): Promise<string | null> {
  if (!uri) return null;
  const { signal, done } = timeout(ms);
  try {
    return await toDataUrl(await fetchSafeImage(uri, signal, MAX_SOURCE_BYTES), size, false);
  } catch {
    return null;
  } finally {
    done();
  }
}

/**
 * A token's composed art from the app's own renderer, or null when it falls back, fails or takes
 * longer than `ms`. Token art is pixel art, so it scales with nearest-neighbour.
 */
export async function tokenArt(daoId: string, tokenId: number, size = 400, ms = 6000): Promise<string | null> {
  const id = String(tokenId);
  try {
    const response = await Promise.race([
      renderToken(new Request(siteHref(`/api/render/${encodeURIComponent(daoId)}/${id}`)), {
        params: Promise.resolve({ daoId, tokenId: id })
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
    ]);
    if (!response || response.headers.get('X-Renderer-Fallback')) return null;
    if (!response.headers.get('Content-Type')?.startsWith('image/webp')) return null;
    return await toDataUrl(await response.arrayBuffer(), size, true);
  } catch {
    return null;
  }
}
