'use client';

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Button, Text } from '@/components/ui';
import { ArtworkProperty } from '@/stores/create-dao-store';

export interface LayerOrderingProps {
  orderedLayers: ArtworkProperty[];
  setOrderedLayers: (layers: ArtworkProperty[]) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

/**
 * Layer ordering component with drag-and-drop and keyboard support.
 *
 * Features:
 * - Drag handles for mouse/touch
 * - Keyboard navigation (Arrow Up/Down)
 * - Visual feedback for current position
 * - Remove layer option
 */
export function LayerOrdering({ orderedLayers, setOrderedLayers }: LayerOrderingProps) {
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const dragMetaRef = useRef<{ startY: number; pointerId: number } | null>(null);
  const rowRefsRef = useRef<Record<number, HTMLDivElement | null>>({});

  // Move layer to new position
  const moveLayer = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= orderedLayers.length || toIndex > orderedLayers.length) {
      return;
    }

    const adjustedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
    if (adjustedToIndex === fromIndex) return;

    const newLayers = [...orderedLayers];
    const [movedLayer] = newLayers.splice(fromIndex, 1);
    newLayers.splice(adjustedToIndex, 0, movedLayer);
    setOrderedLayers(newLayers);
  };

  // Move layer up
  const handleMoveUp = (index: number) => {
    if (index > 0) {
      moveLayer(index, index - 1);
    }
  };

  // Move layer down
  const handleMoveDown = (index: number) => {
    if (index < orderedLayers.length - 1) {
      moveLayer(index, index + 1);
    }
  };

  // Remove layer
  const handleRemoveLayer = (index: number) => {
    const newLayers = orderedLayers.filter((_, i) => i !== index);
    setOrderedLayers(newLayers);
  };

  // Mouse/touch drag handlers
  const handlePointerDown = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) {
      return;
    }

    setActiveDragIndex(index);
    dragMetaRef.current = {
      startY: e.clientY,
      pointerId: e.pointerId
    };

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMetaRef.current || activeDragIndex === null) return;

    // Find which layer the pointer is over
    let insertIndex = activeDragIndex;
    for (let i = 0; i < orderedLayers.length; i++) {
      const row = rowRefsRef.current[i];
      if (!row) continue;

      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (e.clientY < midpoint && i < activeDragIndex) {
        insertIndex = i;
      } else if (e.clientY > midpoint && i > activeDragIndex) {
        insertIndex = i + 1;
      }
    }

    setDragInsertIndex(insertIndex);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMetaRef.current || activeDragIndex === null) return;

    (e.currentTarget as HTMLDivElement).releasePointerCapture(dragMetaRef.current.pointerId);

    if (dragInsertIndex !== null && dragInsertIndex !== activeDragIndex) {
      moveLayer(activeDragIndex, dragInsertIndex);
    }

    setActiveDragIndex(null);
    setDragInsertIndex(null);
    dragMetaRef.current = null;
  };

  // Keyboard navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleMoveUp(index);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleMoveDown(index);
    }
  };

  return (
    <Stack gap="3">
      <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Layers</Text>

      {orderedLayers.length === 0 ? (
        <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
          No layers to organize
        </Text>
      ) : (
        <Stack gap="2">
          {orderedLayers.map((layer, index) => {
            const isTop = index === orderedLayers.length - 1;
            const isBottom = index === 0;
            const isDragging = activeDragIndex === index;
            const isInsertPoint = dragInsertIndex === index;

            return (
              <Box
                key={`${layer.name}-${index}`}
                ref={(el) => {
                  if (el) rowRefsRef.current[index] = el;
                }}
              >
                {/* Insert indicator */}
                {isInsertPoint && activeDragIndex !== null && (
                  <Box
                    style={{
                      height: '2px',
                      backgroundColor: 'var(--info-9)',
                      marginBottom: '0.5rem',
                      borderRadius: '1px'
                    }}
                  />
                )}

                {/* Layer row */}
                <Flex
                  gap="2"
                  style={{
                    padding: '1rem',
                    backgroundColor: isDragging ? 'var(--info-2)' : 'var(--gray-2)',
                    border: `1px solid ${isDragging ? 'var(--info-6)' : 'var(--gray-6)'}`,
                    borderRadius: '0.375rem',
                    alignItems: 'center',
                    cursor: activeDragIndex !== null ? 'grabbing' : 'grab',
                    transition: 'all 0.15s',
                    opacity: activeDragIndex === index ? 0.7 : 1
                  }}
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Layer ${layer.name}, position ${index + 1} of ${orderedLayers.length}`}
                >
                  {/* Drag Handle */}
                  <Box style={{ color: 'var(--gray-10)', flexShrink: 0, cursor: 'grab' }}>
                    <GripVertical size={18} />
                  </Box>

                  {/* Layer Info */}
                  <Stack gap="1" style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>{layer.name}</Text>
                    <Text style={{ fontSize: '0.75rem', color: 'var(--gray-11)' }}>
                      {layer.items.length} item{layer.items.length !== 1 ? 's' : ''} •{' '}
                      {isTop ? 'Top layer' : isBottom ? 'Base layer' : `Layer ${index + 1}`}
                    </Text>
                  </Stack>

                  {/* Controls */}
                  <Flex gap="1" style={{ flexShrink: 0 }} data-no-drag>
                    <Button
                      onClick={() => handleMoveUp(index)}
                      disabled={isBottom}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: 'transparent',
                        color: isBottom ? 'var(--gray-8)' : 'var(--gray-11)'
                      }}
                      title="Move up"
                    >
                      <ChevronUp size={16} />
                    </Button>
                    <Button
                      onClick={() => handleMoveDown(index)}
                      disabled={isTop}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: 'transparent',
                        color: isTop ? 'var(--gray-8)' : 'var(--gray-11)'
                      }}
                      title="Move down"
                    >
                      <ChevronDown size={16} />
                    </Button>
                    <Button
                      onClick={() => handleRemoveLayer(index)}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: 'transparent',
                        color: 'var(--error-9)'
                      }}
                      title="Remove layer"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </Flex>
                </Flex>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Info */}
      <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)', marginTop: '0.5rem' }}>
        💡 Tip: Use drag handle, arrow keys, or buttons to reorder. Bottom layer renders first, top layer on top.
      </Text>
    </Stack>
  );
}
