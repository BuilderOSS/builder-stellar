'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Button, Text } from '@/components/ui';
import { useArtworkPreview } from '@/hooks/useArtworkPreview';
import { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

export interface ArtworkPreviewCanvasProps {
  source: Extract<ArtworkSource, { kind: 'uploaded' | 'starter' }>;
  orderedLayers: ArtworkProperty[];
}

/**
 * Canvas-based artwork preview component.
 *
 * Composites layers on a canvas in order (bottom to top).
 * Features:
 * - Loads images from gateway URLs with fallback
 * - Local Canvas API rendering
 * - Error handling with real-time feedback
 * - Real-time preview updates
 *
 * Uses useArtworkPreview hook for layer management.
 */
export function ArtworkPreviewCanvas({ source, orderedLayers }: ArtworkPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { layerImages, loadingProgress, error, isLoading, hasErrors, hasImages, reload } = useArtworkPreview({
    source,
    orderedLayers,
    canvasRef,
    canvasSize: 400,
    timeoutMs: 15000
  });

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
          overflow: 'hidden'
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
                overflow: 'hidden'
              }}
            >
              <Box
                style={{
                  width: `${loadingProgress}%`,
                  height: '100%',
                  backgroundColor: 'var(--info-9)',
                  transition: 'width 0.2s ease-out'
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
            <Button size="sm" onClick={reload}>
              Retry
            </Button>
          </Stack>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              display: hasImages ? 'block' : 'none'
            }}
          />
        )}
      </Box>

      {/* Status */}
      {hasErrors && (
        <Flex
          gap="2"
          style={{
            alignItems: 'flex-start',
            padding: '0.75rem',
            backgroundColor: 'var(--warning-2)',
            borderRadius: '0.375rem'
          }}
        >
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
                alignItems: 'center'
              }}
            >
              <Box
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: layer.error ? 'var(--error-9)' : layer.blob ? 'var(--success-9)' : 'var(--gray-7)',
                  flexShrink: 0
                }}
              />
              <Text style={{ flex: 1, fontSize: '0.75rem' }}>{layer.name}</Text>
              {layer.error && <Text style={{ fontSize: '0.7rem', color: 'var(--error-9)' }}>{layer.error}</Text>}
            </Flex>
          ))}
        </Box>
      </Stack>

      {/* Reload */}
      <Button
        size="sm"
        onClick={reload}
        style={{ alignSelf: 'flex-start', backgroundColor: 'transparent', color: 'var(--gray-11)' }}
      >
        <RotateCcw size={14} style={{ marginRight: '0.5rem' }} />
        Reload Preview
      </Button>
    </Stack>
  );
}
