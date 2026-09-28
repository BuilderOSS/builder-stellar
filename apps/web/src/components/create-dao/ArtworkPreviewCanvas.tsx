'use client';

import { AnimatePresence, motion } from 'framer-motion';
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
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
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
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center', padding: '2rem' }}
            >
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
                <motion.div
                  animate={{ width: `${loadingProgress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{
                    height: '100%',
                    backgroundColor: 'var(--info-9)'
                  }}
                />
              </Box>
              <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)' }}>{loadingProgress}%</Text>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center', padding: '2rem' }}
            >
              <Flex style={{ justifyContent: 'center' }}>
                <motion.div
                  animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.05, 1.05, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
                >
                  <AlertCircle size={32} style={{ color: 'var(--error-9)' }} />
                </motion.div>
              </Flex>
              <Text style={{ fontSize: '0.875rem', color: 'var(--error-9)' }}>{error}</Text>
              <Button size="sm" onClick={reload}>
                Retry
              </Button>
            </motion.div>
          ) : (
            <motion.canvas
              key="canvas"
              ref={canvasRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: hasImages ? 'block' : 'none'
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Status */}
      <AnimatePresence>
        {hasErrors && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer List */}
      <Stack gap="2">
        <Text style={{ fontWeight: 600, fontSize: '0.75rem' }}>Layer Status</Text>
        <Box style={{ fontSize: '0.75rem', color: 'var(--gray-11)', maxHeight: '150px', overflowY: 'auto' }}>
          <AnimatePresence>
            {layerImages.map((layer, index) => (
              <motion.div
                key={layer.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                layout
              >
                <Flex
                  gap="2"
                  style={{
                    padding: '0.5rem',
                    borderBottom: '1px solid var(--gray-4)',
                    alignItems: 'center'
                  }}
                >
                  <motion.div
                    animate={{
                      scale: layer.url ? [1, 1.2, 1] : 1,
                      boxShadow: layer.url
                        ? [
                            '0 0 0 0px var(--success-9)',
                            '0 0 0 4px rgba(74, 197, 130, 0.3)',
                            '0 0 0 0px rgba(74, 197, 130, 0)'
                          ]
                        : 'none'
                    }}
                    transition={{
                      duration: layer.url ? 1.5 : 0,
                      repeat: layer.url ? Infinity : 0,
                      repeatDelay: 2
                    }}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: layer.error
                        ? 'var(--error-9)'
                        : layer.url
                          ? 'var(--success-9)'
                          : 'var(--gray-7)',
                      flexShrink: 0
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: '0.75rem' }}>{layer.name}</Text>
                  <AnimatePresence>
                    {layer.error && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Text style={{ fontSize: '0.7rem', color: 'var(--error-9)' }}>{layer.error}</Text>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Flex>
              </motion.div>
            ))}
          </AnimatePresence>
        </Box>
      </Stack>

      {/* Reload */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Button
          size="sm"
          onClick={reload}
          style={{ alignSelf: 'flex-start', backgroundColor: 'transparent', color: 'var(--gray-11)' }}
        >
          <motion.div
            animate={{ rotate: !isLoading ? 0 : 360 }}
            transition={{ duration: isLoading ? 2 : 0, repeat: isLoading ? Infinity : 0, ease: 'linear' }}
            style={{ display: 'flex', marginRight: '0.5rem' }}
          >
            <RotateCcw size={14} />
          </motion.div>
          Reload Preview
        </Button>
      </motion.div>
    </Stack>
  );
}
