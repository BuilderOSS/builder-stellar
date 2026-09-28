import { getFetchableUrls } from '@/lib/ipfs-gateway';

/**
 * Load an image with automatic gateway fallback.
 * Tries multiple gateways sequentially if one fails.
 *
 * @param uri - IPFS URI or HTTP URL
 * @param timeoutMs - Timeout per gateway in milliseconds (default: 10000)
 * @returns Promise resolving to the image Blob
 * @throws Error if all gateways fail or URI is invalid
 */
export async function loadImageWithFallback(uri: string, timeoutMs: number = 10000): Promise<Blob> {
  const urls = getFetchableUrls(uri);
  if (!urls?.length) {
    throw new Error(`Invalid image URI: ${uri}`);
  }

  let lastError: Error | undefined;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();

      // Validate it's an image
      if (!blob.type.startsWith('image/')) {
        throw new Error('Invalid image type');
      }

      return blob;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      console.warn(
        `Gateway ${i + 1}/${urls.length} failed (${url.replace(/^https?:\/\//, '')}): ${lastError.message}`
      );
      // Continue to next gateway
    }
  }

  throw new Error(`All ${urls.length} gateways failed. Last error: ${lastError?.message}`);
}

/**
 * Load multiple images with fallback, with concurrency control.
 * Useful for loading multiple layers at once.
 *
 * @param uris - Array of image URIs
 * @param concurrency - Number of concurrent requests (default: 4)
 * @param timeoutMs - Timeout per gateway in milliseconds (default: 10000)
 * @returns Promise resolving to array of Blobs with errors
 */
export async function loadImagesWithFallback(
  uris: string[],
  concurrency: number = 4,
  timeoutMs: number = 10000
): Promise<(Blob | Error)[]> {
  const results: (Blob | Error)[] = [];
  const pending: Promise<void>[] = [];

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];

    const load = async () => {
      try {
        const blob = await loadImageWithFallback(uri, timeoutMs);
        results[i] = blob;
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error('Unknown error');
      }
    };

    pending.push(load());

    // Maintain concurrency limit
    if (pending.length >= concurrency) {
      await Promise.race(pending);
      pending.splice(
        pending.findIndex((p) => p === load()),
        1
      );
    }
  }

  // Wait for all remaining
  await Promise.all(pending);

  return results;
}
