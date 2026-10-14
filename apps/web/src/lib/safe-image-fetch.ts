import { isIP } from 'node:net';

import sharp from 'sharp';
import { Agent, fetch } from 'undici';

import { assertSafeRemoteUrl, getFetchableUrls, IPFS_GATEWAYS } from '@/lib/ipfs-gateway';

// Remote images (token layers, tribe images) fetched on the server. Every hop is checked against
// private addresses and pinned to the address that was checked, redirects are followed by hand,
// and size and format are capped. Used by /api/render and the share cards.

const MAX_REDIRECTS = 3;
export const MAX_INPUT_PIXELS = 16_777_216;
const ALLOWED_IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp']);

function abortError() {
  return new DOMException('Artwork request timed out', 'AbortError');
}

export async function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();

  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function fetchSafeImage(uri: string, signal: AbortSignal, maxBytes: number) {
  const urls = getFetchableUrls(uri);
  if (!urls?.length) throw new Error(`Unsupported artwork URL: ${uri}`);

  let lastError: Error | undefined;
  for (let urlIndex = 0; urlIndex < urls.length; urlIndex += 1) {
    let url = urls[urlIndex];
    try {
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        const isIpfsGateway = IPFS_GATEWAYS.some((gateway) => new URL(gateway).hostname === new URL(url).hostname);
        const addresses = await withSignal(assertSafeRemoteUrl(url, isIpfsGateway), signal);
        const pinnedAddress = addresses[0];
        const dispatcher = new Agent({
          connect: {
            lookup: (_hostname, options, callback) => {
              const family = isIP(pinnedAddress);
              if (options.all) {
                callback(null, [{ address: pinnedAddress, family }]);
                return;
              }

              callback(null, pinnedAddress, family);
            }
          }
        });

        try {
          const response = await fetch(url, {
            redirect: 'manual',
            signal,
            dispatcher
          });

          if (response.status >= 300 && response.status < 400) {
            if (redirect === MAX_REDIRECTS) throw new Error('Too many artwork redirects');
            const location = response.headers.get('location');
            if (!location) throw new Error('Artwork redirect has no location');
            url = new URL(location, url).toString();
            continue;
          }

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const contentLength = Number(response.headers.get('content-length'));
          if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            throw new Error('Artwork exceeds size limit');
          }

          if (!response.body) throw new Error('Artwork response has no body');
          const reader = response.body.getReader();
          const chunks: Buffer[] = [];
          let totalBytes = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) throw new Error('Artwork exceeds size limit');
            chunks.push(Buffer.from(value));
          }
          const image = Buffer.concat(chunks, totalBytes);
          const metadata = await withSignal(sharp(image, { limitInputPixels: MAX_INPUT_PIXELS }).metadata(), signal);
          if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
            throw new Error('Unsupported artwork format');
          }
          return image;
        } finally {
          await dispatcher.close();
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Artwork fetch failed');
      if (urlIndex === urls.length - 1) break;
    }
  }
  throw lastError || new Error('Artwork fetch failed');
}
