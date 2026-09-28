'use client';

import { useCallback, useEffect, useState } from 'react';

import { getFetchableUrls } from '@/lib/ipfs-client';
import { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

export interface LayerImage {
  name: string;
  url?: string;
  error?: string;
}

interface UseArtworkPreviewOptions {
  source: Extract<ArtworkSource, { kind: 'uploaded' | 'starter' }>;
  orderedLayers: ArtworkProperty[];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize?: number;
  timeoutMs?: number;
}

interface UseArtworkPreviewResult {
  layerImages: LayerImage[];
  loadingProgress: number;
  error: string | null;
  isLoading: boolean;
  hasErrors: boolean;
  hasImages: boolean;
  reload: () => void;
}

function loadImage(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeoutId = window.setTimeout(() => {
      image.src = '';
      reject(new Error('Image load timed out'));
    }, timeoutMs);

    image.onload = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('Failed to load image'));
    };
    image.src = url;
  });
}

/**
 * Hook to manage artwork preview canvas rendering.
 *
 * Handles:
 * - Loading layer images from gateway URLs with fallback
 * - Compositing layers on canvas in order
 * - Progress tracking and error handling
 * - Automatic reload capability
 *
 * @param options Configuration for the preview
 * @returns Preview state and control functions
 */
export function useArtworkPreview({
  source,
  orderedLayers,
  canvasRef,
  canvasSize = 400,
  timeoutMs = 15000
}: UseArtworkPreviewOptions): UseArtworkPreviewResult {
  const [layerImages, setLayerImages] = useState<LayerImage[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Build layer URL from source properties
   */
  const buildLayerUrl = useCallback(
    (property: ArtworkProperty, extension: string): string => {
      if (!source.baseUri || !property.name || property.items.length === 0) {
        return '';
      }

      const itemName = property.items[0];
      const cleanBase = source.baseUri.replace(/\/$/, '');

      // Handle different base URI formats
      if (cleanBase.startsWith('ipfs://')) {
        const cid = cleanBase.replace('ipfs://', '');
        const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'nouns-builder.mypinata.cloud';
        const gatewayUrl = `https://${gateway}/ipfs/${cid}`;
        return `${gatewayUrl}/${property.name}/${itemName}${extension}`;
      }

      if (cleanBase.startsWith('https://')) {
        return `${cleanBase}/${property.name}/${itemName}${extension}`;
      }

      return `${cleanBase}/${property.name}/${itemName}${extension}`;
    },
    [source.baseUri]
  );

  /**
   * Load all layer images
   */
  const loadLayers = useCallback(async () => {
    if (!source || !orderedLayers.length) {
      setLayerImages([]);
      return;
    }

    const extension = source.extension || '.png';
    const layers: LayerImage[] = [];

    try {
      setError(null);
      setLoadingProgress(0);

      for (let i = 0; i < orderedLayers.length; i++) {
        const property = orderedLayers[i];
        const url = buildLayerUrl(property, extension);

        if (!url) {
          layers.push({ name: property.name, error: 'Invalid URL' });
          continue;
        }

        try {
          const urls = getFetchableUrls(url);
          if (!urls?.length) throw new Error('Invalid image URL');

          let loadedUrl: string | undefined;
          let lastError: Error | undefined;
          for (const candidate of urls) {
            try {
              await loadImage(candidate, timeoutMs);
              loadedUrl = candidate;
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error('Failed to load image');
            }
          }

          if (!loadedUrl) throw lastError ?? new Error('All image gateways failed');
          layers.push({ name: property.name, url: loadedUrl });
        } catch (err) {
          layers.push({
            name: property.name,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }

        setLoadingProgress(Math.round(((i + 1) / orderedLayers.length) * 100));
      }

      setLayerImages(layers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artwork');
      setLayerImages([]);
    }
  }, [source, orderedLayers, buildLayerUrl, timeoutMs]);

  /**
   * Render canvas with composited layers
   */
  const performCanvasRender = useCallback(async (canvas: HTMLCanvasElement, layers: LayerImage[], size: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || layers.length === 0) return;

    // Set canvas size
    canvas.width = size;
    canvas.height = size;

    // Clear canvas with light background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, size, size);

    // Composite layers (bottom to top)
    for (const layer of layers) {
      if (!layer.url) continue;

      try {
        const img = new Image();

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // Draw image centered, maintaining aspect ratio
            const scale = Math.min(size / img.width, size / img.height);
            const x = (size - img.width * scale) / 2;
            const y = (size - img.height * scale) / 2;

            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            resolve();
          };

          img.onerror = () => reject(new Error('Failed to draw image'));

          img.src = layer.url!;
        });
      } catch (err) {
        console.warn(`Failed to render layer ${layer.name}:`, err);
      }
    }
  }, []);

  // Load layers when source or ordering changes
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (isMounted) {
        await loadLayers();
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loadLayers]);

  // Render canvas when layer images change
  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (isMounted && canvasRef.current && layerImages.length > 0) {
        await performCanvasRender(canvasRef.current, layerImages, canvasSize);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [layerImages, canvasSize, performCanvasRender, canvasRef]);

  // Determine state
  const isLoading = layerImages.length === 0 && orderedLayers.length > 0 && !error;
  const hasErrors = layerImages.some((l) => l.error);
  const hasImages = layerImages.some((l) => l.url);

  return {
    layerImages,
    loadingProgress,
    error,
    isLoading,
    hasErrors,
    hasImages,
    reload: loadLayers
  };
}
