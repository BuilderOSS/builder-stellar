'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Stack, Box, Flex } from 'styled-system/jsx';

import { Button, Text } from '@/components/ui';
import { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

export interface ArtworkPreviewCanvasProps {
  source: ArtworkSource;
  orderedLayers: ArtworkProperty[];
  isGenerating?: boolean;
}

interface LayerImage {
  name: string;
  blob?: Blob;
  error?: string;
}

/**
 * Canvas-based artwork preview component.
 *
 * Composites layers on a canvas in order (bottom to top).
 * Features:
 * - Loads images from gateway URLs
 * - Local Canvas API rendering
 * - Error handling with fallback
 * - Real-time preview updates
 */
export function ArtworkPreviewCanvas({
  source,
  orderedLayers,
  isGenerating = false,
}: ArtworkPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layerImages, setLayerImages] = useState<LayerImage[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Get gateway URL for IPFS URI
  const getGatewayUrl = (ipfsUri: string): string => {
    if (!ipfsUri) return '';

    // Extract CID from ipfs:// or gateway URL
    if (ipfsUri.startsWith('ipfs://')) {
      const cid = ipfsUri.replace('ipfs://', '');
      const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'nouns-builder.mypinata.cloud';
      return `https://${gateway}/ipfs/${cid}`;
    }

    // Already a gateway URL
    return ipfsUri;
  };

  // Build layer image URL
  const buildLayerUrl = (baseUri: string, property: ArtworkProperty, extension: string): string => {
    if (!baseUri || !property.name || property.items.length === 0) {
      return '';
    }

    // Use first item as preview
    const itemName = property.items[0];
    const cleanBase = baseUri.replace(/\/$/, '');

    // Handle different base URI formats
    if (cleanBase.startsWith('ipfs://') || cleanBase.startsWith('https://')) {
      const gatewayUrl = getGatewayUrl(cleanBase);
      return `${gatewayUrl}/${property.name}/${itemName}${extension}`;
    }

    return `${cleanBase}/${property.name}/${itemName}${extension}`;
  };

  // Load image from URL
  const loadImage = async (url: string): Promise<Blob | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();

      // Validate it's an image
      if (!blob.type.startsWith('image/')) {
        throw new Error('Not an image');
      }

      return blob;
    } catch (err) {
      throw new Error(`Failed to load image: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Load all layer images
  const loadLayers = async () => {
    if (!source || !orderedLayers.length) {
      setLayerImages([]);
      return;
    }

    const baseUri = source.baseUri;
    const extension = source.extension || '.png';
    const layers: LayerImage[] = [];

    try {
      setError(null);
      setLoadingProgress(0);

      for (let i = 0; i < orderedLayers.length; i++) {
        const property = orderedLayers[i];
        const url = buildLayerUrl(baseUri, property, extension);

        if (!url) {
          layers.push({ name: property.name, error: 'Invalid URL' });
          continue;
        }

        try {
          const blob = await loadImage(url);
          if (blob) {
            layers.push({ name: property.name, blob });
          } else {
            layers.push({ name: property.name, error: 'No blob returned' });
          }
        } catch (err) {
          layers.push({
            name: property.name,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }

        setLoadingProgress(Math.round(((i + 1) / orderedLayers.length) * 100));
      }

      setLayerImages(layers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artwork');
      setLayerImages([]);
    }
  };

  // Render canvas
  const renderCanvas = async () => {
    if (!canvasRef.current || layerImages.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas size
    const size = 400;
    canvas.width = size;
    canvas.height = size;

    // Clear canvas
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, size, size);

    // Composite layers
    for (const layer of layerImages) {
      if (!layer.blob) continue;

      try {
        const url = URL.createObjectURL(layer.blob);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // Draw image centered, maintaining aspect ratio
            const scale = Math.min(size / img.width, size / img.height);
            const x = (size - img.width * scale) / 2;
            const y = (size - img.height * scale) / 2;

            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            URL.revokeObjectURL(url);
            resolve();
          };

          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to draw image'));
          };

          img.src = url;
        });
      } catch (err) {
        console.warn(`Failed to render layer ${layer.name}:`, err);
      }
    }
  };

  // Load layers when orderedLayers change
  useEffect(() => {
    loadLayers();
  }, [source, orderedLayers]);

  // Render canvas when layerImages change
  useEffect(() => {
    renderCanvas();
  }, [layerImages]);

  const handleReload = () => {
    loadLayers();
  };

  // Determine display state
  const isLoading = layerImages.length === 0 && orderedLayers.length > 0 && !error;
  const hasErrors = layerImages.some((l) => l.error);
  const hasImages = layerImages.some((l) => l.blob);

  return (
    <Stack gap="3">
      {/* Canvas */}
      <Box
        style={{
          borderRadius: '0.375rem',
          backgroundColor: '#f5f5f5',
          border: '1px solid var(--gray-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <Stack gap="2" style={{ textAlign: 'center', padding: '2rem' }}>
            <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>Loading layers...</Text>
            <Box
              style={{
                width: '100%',
                height: '4px',
                backgroundColor: 'var(--gray-4)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <Box
                style={{
                  width: `${loadingProgress}%`,
                  height: '100%',
                  backgroundColor: 'var(--info-9)',
                  transition: 'width 0.2s ease-out',
                }}
              />
            </Box>
            <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)' }}>{loadingProgress}%</Text>
          </Stack>
        ) : error ? (
          <Stack gap="2" style={{ textAlign: 'center', padding: '2rem' }}>
            <Flex style={{ justifyContent: 'center' }}>
              <AlertCircle size={32} style={{ color: 'var(--error-9)' }} />
            </Flex>
            <Text style={{ fontSize: '0.875rem', color: 'var(--error-9)' }}>{error}</Text>
            <Button size="sm" onClick={handleReload}>
              Retry
            </Button>
          </Stack>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              display: hasImages ? 'block' : 'none',
            }}
          />
        )}
      </Box>

      {/* Status */}
      {hasErrors && (
        <Flex gap="2" style={{ alignItems: 'flex-start', padding: '0.75rem', backgroundColor: 'var(--warning-2)', borderRadius: '0.375rem' }}>
          <AlertCircle size={16} style={{ color: 'var(--warning-9)', flexShrink: 0, marginTop: '0.125rem' }} />
          <Text style={{ fontSize: '0.75rem', color: 'var(--warning-11)' }}>
            Some layers failed to load. Check the gateway URLs are accessible.
          </Text>
        </Flex>
      )}

      {/* Layer List */}
      <Stack gap="2">
        <Text style={{ fontWeight: 600, fontSize: '0.75rem' }}>Layer Status</Text>
        <Box style={{ fontSize: '0.75rem', color: 'var(--gray-11)', maxHeight: '150px', overflowY: 'auto' }}>
          {layerImages.map((layer) => (
            <Flex
              key={layer.name}
              gap="2"
              style={{
                padding: '0.5rem',
                borderBottom: '1px solid var(--gray-4)',
                alignItems: 'center',
              }}
            >
              <Box
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: layer.error ? 'var(--error-9)' : layer.blob ? 'var(--success-9)' : 'var(--gray-7)',
                  flexShrink: 0,
                }}
              />
              <Text style={{ flex: 1, fontSize: '0.75rem' }}>{layer.name}</Text>
              {layer.error && (
                <Text style={{ fontSize: '0.7rem', color: 'var(--error-9)' }}>
                  {layer.error}
                </Text>
              )}
            </Flex>
          ))}
        </Box>
      </Stack>

      {/* Reload */}
      <Button
        size="sm"
        onClick={handleReload}
        style={{ alignSelf: 'flex-start', backgroundColor: 'transparent', color: 'var(--gray-11)' }}
      >
        <RotateCcw size={14} style={{ marginRight: '0.5rem' }} />
        Reload Preview
      </Button>
    </Stack>
  );
}
