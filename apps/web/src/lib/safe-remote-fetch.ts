import { isIP } from 'node:net';

import { Agent, fetch, type Response } from 'undici';

import { assertSafeRemoteUrl, IPFS_GATEWAYS } from '@/lib/ipfs-gateway';

/** Redirects followed before a server-side fetch gives up. */
export const MAX_REDIRECTS = 3;

const GATEWAY_HOSTS = new Set(IPFS_GATEWAYS.map((gateway) => new URL(gateway).hostname));

function abortError() {
  return new DOMException('Remote request timed out', 'AbortError');
}

/** Race `promise` against `signal`, for work that can't be cancelled itself (DNS lookups, sharp). */
export async function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError();

  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * GET a URL from the server without reaching a private or internal address (SSRF).
 *
 * Every hop, redirects included, must use HTTPS and resolve only to public addresses
 * (`assertSafeRemoteUrl`), and the connection is pinned to the address that was checked, so a
 * second DNS answer can't swap in an internal address after the check. Redirects are followed by
 * hand, at most MAX_REDIRECTS, because a followed redirect would skip the check. `read` consumes
 * the final response before its connection closes.
 */
export async function fetchPublicUrl<T>(
  url: string,
  signal: AbortSignal,
  read: (response: Response) => Promise<T>
): Promise<T> {
  let current = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const isIpfsGateway = GATEWAY_HOSTS.has(new URL(current).hostname);
    const addresses = await withSignal(assertSafeRemoteUrl(current, isIpfsGateway), signal);
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
      const response = await fetch(current, { redirect: 'manual', signal, dispatcher });
      if (response.status >= 300 && response.status < 400) {
        if (redirect === MAX_REDIRECTS) throw new Error('Too many redirects');
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect has no location');
        current = new URL(location, current).toString();
        continue;
      }
      return await read(response);
    } finally {
      // Destroy, not close: close waits for a body nobody reads (a redirect's, or one `read`
      // rejected), which would hold the fetch until the signal aborts.
      await dispatcher.destroy();
    }
  }
  throw new Error('Too many redirects');
}

/** The whole body, or `tooLarge` as soon as the declared or streamed size passes `maxBytes`. */
export async function readCapped(response: Response, maxBytes: number, tooLarge: string): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(tooLarge);
  if (!response.body) throw new Error('Response has no body');

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(tooLarge);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes);
}
