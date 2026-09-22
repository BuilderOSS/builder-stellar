import sharp from 'sharp';

import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { assertSafeRemoteUrl, getFetchableUrls, IPFS_GATEWAYS } from '@/lib/ipfs-gateway';
import { resolveOnchainTokenMetadata } from '@/lib/onchain-token-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_INPUT_PIXELS = 16_777_216;
const SIZE = 1080;
// MVP supports static raster layers only. SVG and animated formats are rejected
// so untrusted markup and time-varying output never enter the compositor.
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function parseTokenId(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('Invalid token id');
  return parsed;
}

async function fetchImage(uri: string) {
  const urls = getFetchableUrls(uri);
  if (!urls?.length) throw new Error(`Unsupported artwork URL: ${uri}`);

  let lastError: Error | undefined;
  for (let urlIndex = 0; urlIndex < urls.length; urlIndex += 1) {
    let url = urls[urlIndex];
    try {
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        const isIpfsGateway = IPFS_GATEWAYS.some((gateway) => new URL(gateway).hostname === new URL(url).hostname);
        await assertSafeRemoteUrl(url, isIpfsGateway);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const response = await fetch(url, { redirect: 'manual', signal: controller.signal });

          if (response.status >= 300 && response.status < 400) {
            if (redirect === MAX_REDIRECTS) throw new Error('Too many artwork redirects');
            const location = response.headers.get('location');
            if (!location) throw new Error('Artwork redirect has no location');
            url = new URL(location, url).toString();
            continue;
          }

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase();
          if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
            throw new Error(`Unsupported artwork MIME type: ${contentType || 'unknown'}`);
          }

          const contentLength = Number(response.headers.get('content-length'));
          if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
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
            if (totalBytes > MAX_IMAGE_BYTES) throw new Error('Artwork exceeds size limit');
            chunks.push(Buffer.from(value));
          }
          return Buffer.concat(chunks, totalBytes);
        } finally {
          clearTimeout(timeout);
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Artwork fetch failed');
      if (urlIndex === urls.length - 1) break;
    }
  }
  throw lastError || new Error('Artwork fetch failed');
}

function fallbackSvg(message: string) {
  const safe = message.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] || character
  );
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#16181d"/><text x="540" y="510" fill="#fff" font-family="sans-serif" font-size="42" text-anchor="middle">Artwork unavailable</text><text x="540" y="570" fill="#9aa3b2" font-family="sans-serif" font-size="24" text-anchor="middle">${safe}</text></svg>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string; tokenId: string }> }) {
  const { daoId, tokenId } = await params;
  try {
    const resolvedTokenId = parseTokenId(tokenId);
    const config = await getDaoNetworkConfigById(daoId);
    const origin = new URL(request.url).origin;
    const metadata = await resolveOnchainTokenMetadata(
      config,
      resolvedTokenId,
      `${origin}/api/render/${daoId}/${resolvedTokenId}`
    );
    if (metadata.artwork.length === 0) throw new Error(`No artwork found for token ${resolvedTokenId}`);
    const layers = await Promise.all(metadata.artwork.map(({ url }) => fetchImage(url)));
    const base = await sharp(layers[0], { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(SIZE, SIZE, { fit: 'contain' })
      .png()
      .toBuffer();
    const overlays = await Promise.all(
      layers
        .slice(1)
        .map((layer) =>
          sharp(layer, { limitInputPixels: MAX_INPUT_PIXELS }).resize(SIZE, SIZE, { fit: 'contain' }).png().toBuffer()
        )
    );
    const image = await sharp(base)
      .composite(overlays.map((input) => ({ input })))
      .webp({ quality: 85 })
      .toBuffer();

    return new Response(image, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'image/webp'
      }
    });
  } catch (error) {
    return new Response(fallbackSvg(error instanceof Error ? error.message : 'Unable to render token'), {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'X-Renderer-Fallback': 'true'
      }
    });
  }
}
