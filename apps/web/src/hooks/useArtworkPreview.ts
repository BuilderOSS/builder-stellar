'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { loadImageWithFallback } from '@/lib/image-loader';
import { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

export interface LayerImage {
  name: string;
  blob?: Blob;
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
  loadingProgress: number;
  error: string | null;
  isLoading: boolean;
  hasErrors: boolean;
  hasImages: boolean;
  reload: () => void;
}

export function pickRandomArtworkItem(items: string[], random = Math.random) {
  if (items.length === 0) return '';
  return items[Math.floor(random() * items.length)];
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
  const loadIdRef = useRef(0);

  /**
   * Build layer URL from source properties
   */
  const buildLayerUrl = useCallback(
    (property: ArtworkProperty, itemName: string, extension: string): string => {
      if (!source.baseUri || !property.name || property.items.length === 0) {
        return '';
      }

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
    const loadId = ++loadIdRef.current;

    if (!source || !orderedLayers.length) {
      setLayerImages([]);
      return;
    }

    const extension = source.extension || '.png';
    const layers: LayerImage[] = [];

    try {
      setError(null);
      setLoadingProgress(0);
      setLayerImages([]);

      for (let i = 0; i < orderedLayers.length; i++) {
        const property = orderedLayers[i];
        const itemName = pickRandomArtworkItem(property.items);
        const url = buildLayerUrl(property, itemName, extension);

        if (!url) {
          layers.push({ name: property.name, error: 'Invalid URL' });
          continue;
        }

        try {
          const blob = await loadImageWithFallback(url, timeoutMs);
          layers.push({ name: property.name, blob });
        } catch (err) {
          layers.push({
            name: property.name,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }

        if (loadId !== loadIdRef.current) return;
        setLoadingProgress(Math.round(((i + 1) / orderedLayers.length) * 100));
      }

      if (loadId !== loadIdRef.current) return;
      setLayerImages(layers);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
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
      if (!layer.blob) continue;

      try {
        const objectUrl = URL.createObjectURL(layer.blob);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // Draw image centered, maintaining aspect ratio
            const scale = Math.min(size / img.width, size / img.height);
            const x = (size - img.width * scale) / 2;
            const y = (size - img.height * scale) / 2;

            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            URL.revokeObjectURL(objectUrl);
            resolve();
          };

          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to draw image'));
          };

          img.src = objectUrl;
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
    let frameId: number | undefined;

    const renderWhenCanvasIsMounted = () => {
      if (!isMounted || layerImages.length === 0) return;

      if (!canvasRef.current) {
        frameId = requestAnimationFrame(renderWhenCanvasIsMounted);
        return;
      }

      void performCanvasRender(canvasRef.current, layerImages, canvasSize);
    };

    frameId = requestAnimationFrame(renderWhenCanvasIsMounted);

    return () => {
      isMounted = false;
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [layerImages, canvasSize, performCanvasRender, canvasRef]);

  // Determine state
  const isLoading = layerImages.length === 0 && orderedLayers.length > 0 && !error;
  const hasErrors = layerImages.some((l) => l.error);
  const hasImages = layerImages.some((l) => l.blob);

  return {
    loadingProgress,
    error,
    isLoading,
    hasErrors,
    hasImages,
    reload: loadLayers
  };
}
