'use client';

import { ChevronLeft } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Button, Card, Heading, Text } from '@/components/ui';
import { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

import { ArtworkPreviewCanvas } from './ArtworkPreviewCanvas';
import { LayerOrdering } from './LayerOrdering';

export type PlaygroundArtworkSource = Extract<ArtworkSource, { kind: 'uploaded' | 'starter' }>;

export interface ArtworkPlaygroundProps {
  source: PlaygroundArtworkSource;
  onComplete: (source: PlaygroundArtworkSource) => void;
  onBack: () => void;
}

export type OrderedTraits = ArtworkProperty[];

/**
 * Playground for reordering artwork layers and previewing the composite.
 *
 * Features:
 * - Drag-and-drop layer reordering
 * - Real-time preview generation
 * - Visual feedback for layer order
 * - Finalize when satisfied
 */
export function ArtworkPlayground({ source, onComplete, onBack }: ArtworkPlaygroundProps) {
  const [orderedLayers, setOrderedLayers] = useState<OrderedTraits>(source.properties);
  const [isGenerating, setIsGenerating] = useState(false);

  // Can only proceed if we have properties
  const canProceed = orderedLayers.length > 0;

  const handleComplete = useCallback(() => {
    // Update source with new layer order
    const updatedSource: PlaygroundArtworkSource = {
      ...source,
      properties: orderedLayers
    };
    onComplete(updatedSource);
  }, [source, orderedLayers, onComplete]);

  return (
    <Stack gap="4">
      {/* Header */}
      <Flex gap="2" style={{ alignItems: 'center' }}>
        <Button onClick={onBack} style={{ backgroundColor: 'transparent', color: 'var(--gray-11)', padding: '0.5rem' }}>
          <ChevronLeft size={20} />
        </Button>
        <Heading as="h3" style={{ fontSize: '1.25rem' }}>
          Preview & Organize Artwork
        </Heading>
      </Flex>

      {/* Info */}
      <Text style={{ color: 'var(--gray-11)', fontSize: '0.9rem' }}>
        Reorder layers to control which traits appear on top. The preview updates in real-time as you reorganize.
      </Text>

      <Flex gap="4" style={{ flexDirection: 'column' }} className="lg:flex-row">
        {/* Layer Ordering - Left Side */}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Card p="5">
            <LayerOrdering
              orderedLayers={orderedLayers}
              setOrderedLayers={setOrderedLayers}
              onGeneratingChange={setIsGenerating}
            />
          </Card>
        </Box>

        {/* Preview - Right Side */}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Card p="5">
            <Stack gap="3">
              <Heading as="h4" style={{ fontSize: '1rem' }}>
                Preview
              </Heading>

              <ArtworkPreviewCanvas source={source} orderedLayers={orderedLayers} />

              <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)' }}>
                {orderedLayers.length} layer{orderedLayers.length !== 1 ? 's' : ''} • Layers render from bottom to top
              </Text>
            </Stack>
          </Card>
        </Box>
      </Flex>

      {/* Actions */}
      <Flex gap="2" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onBack}>Back</Button>
        <Button onClick={handleComplete} disabled={!canProceed || isGenerating} style={{ flex: '0 1 auto' }}>
          {isGenerating ? 'Generating...' : 'Continue'}
        </Button>
      </Flex>
    </Stack>
  );
}
