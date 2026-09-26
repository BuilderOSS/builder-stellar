import { isIP } from 'node:net';

import sharp from 'sharp';
import { Agent, fetch } from 'undici';

import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { assertSafeRemoteUrl, getFetchableUrls, IPFS_GATEWAYS } from '@/lib/ipfs-gateway';
import { resolveOnchainTokenMetadata } from '@/lib/onchain-token-metadata';
import { parseTokenId } from '@/lib/token-id';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_LAYERS = 16;
const MAX_REDIRECTS = 3;
const MAX_INPUT_PIXELS = 16_777_216;
const SIZE = 1080;
const ALLOWED_IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp']);

function abortError() {
  return new DOMException('Artwork request timed out', 'AbortError');
}

async function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();

  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function fetchImage(uri: string, signal: AbortSignal, maxBytes: number) {
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
            lookup: (_hostname, _options, callback) => {
              callback(null, pinnedAddress, isIP(pinnedAddress));
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

function fallbackSvg() {
  return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#16181d"/><text x="540" y="540" fill="#fff" font-family="sans-serif" font-size="42" text-anchor="middle">Artwork unavailable</text></svg>';
}

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const { daoId, tokenId } = await params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resolvedTokenId = parseTokenId(tokenId);
    const config = await withSignal(getDaoNetworkConfigById(daoId), controller.signal);
    const origin = new URL(request.url).origin;
    const metadata = await withSignal(
      resolveOnchainTokenMetadata(config, resolvedTokenId, `${origin}/api/render/${daoId}/${resolvedTokenId}`),
      controller.signal
    );
    if (metadata.artwork.length === 0) throw new Error(`No artwork found for token ${resolvedTokenId}`);
    if (metadata.artwork.length > MAX_LAYERS) throw new Error('Artwork has too many layers');

    const layers: Buffer[] = [];
    let totalBytes = 0;
    for (const { url } of metadata.artwork) {
      const layer = await fetchImage(
        url,
        controller.signal,
        Math.min(MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES - totalBytes)
      );
      totalBytes += layer.byteLength;
      layers.push(layer);
    }

    const base = await withSignal(
      sharp(layers[0], { limitInputPixels: MAX_INPUT_PIXELS }).resize(SIZE, SIZE, { fit: 'contain' }).png().toBuffer(),
      controller.signal
    );
    const overlays: Buffer[] = [];
    for (const layer of layers.slice(1)) {
      overlays.push(
        await withSignal(
          sharp(layer, { limitInputPixels: MAX_INPUT_PIXELS }).resize(SIZE, SIZE, { fit: 'contain' }).png().toBuffer(),
          controller.signal
        )
      );
    }
    const image = await withSignal(
      sharp(base)
        .composite(overlays.map((input) => ({ input })))
        .webp({ quality: 85 })
        .toBuffer(),
      controller.signal
    );

    return new Response(image, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'image/webp'
      }
    });
  } catch (error) {
    console.error('Token artwork render failed', error);
    return new Response(fallbackSvg(), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'X-Renderer-Fallback': 'true'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}
