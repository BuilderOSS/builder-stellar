'use client';

import { useCallback, useEffect, useState } from 'react';

import { loadImageWithFallback } from '@/lib/image-loader';

interface UseFallbackSrcOptions {
  src: string;
  onLoadStart?: () => void;
  onLoadSuccess?: () => void;
  onLoadError?: (error: string) => void;
}

interface UseFallbackSrcResult {
  dataSrc: string | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Hook to load an image with IPFS gateway fallback.
 *
 * Converts an image into a data URL using the fallback gateway mechanism.
 * Useful for displaying IPFS images reliably when gateways may fail.
 *
 * @param options Configuration for the fallback
 * @returns State containing data URL or error
 */
export function useFallbackSrc({
  src,
  onLoadStart,
  onLoadSuccess,
  onLoadError
}: UseFallbackSrcOptions): UseFallbackSrcResult {
  const [dataSrc, setDataSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!src) return;

      try {
        onLoadStart?.();
        if (isMounted) setIsLoading(true);
        if (isMounted) setError(null);

        // Use the fallback mechanism to load the image
        const blob = await loadImageWithFallback(src, 15000);

        if (!isMounted) return;

        // Convert blob to data URL
        const reader = new FileReader();
        reader.onload = () => {
          if (isMounted) {
            const dataUrl = reader.result as string;
            setDataSrc(dataUrl);
            onLoadSuccess?.();
          }
        };

        reader.onerror = () => {
          if (isMounted) {
            const errorMsg = 'Failed to read blob as data URL';
            setError(errorMsg);
            onLoadError?.(errorMsg);
          }
        };

        reader.readAsDataURL(blob);
      } catch (err) {
        if (isMounted) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load image';
          setError(errorMsg);
          onLoadError?.(errorMsg);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [src, onLoadStart, onLoadSuccess, onLoadError]);

  const retryLoad = useCallback(async () => {
    if (!src) return;

    try {
      onLoadStart?.();
      setIsLoading(true);
      setError(null);

      const blob = await loadImageWithFallback(src, 15000);

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setDataSrc(dataUrl);
        onLoadSuccess?.();
      };

      reader.onerror = () => {
        const errorMsg = 'Failed to read blob as data URL';
        setError(errorMsg);
        onLoadError?.(errorMsg);
      };

      reader.readAsDataURL(blob);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load image';
      setError(errorMsg);
      onLoadError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [src, onLoadStart, onLoadSuccess, onLoadError]);

  return {
    dataSrc,
    isLoading,
    error,
    retry: retryLoad
  };
}
