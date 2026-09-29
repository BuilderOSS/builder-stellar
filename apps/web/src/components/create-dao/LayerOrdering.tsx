'use client';

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Button, Text } from '@/components/ui';
import { moveLayer } from '@/lib/layer-order';
import { ArtworkProperty } from '@/stores/create-dao-store';

export interface LayerOrderingProps {
  orderedLayers: ArtworkProperty[];
  setOrderedLayers: (layers: ArtworkProperty[]) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

function DropSlot({ active }: { active: boolean }) {
  return (
    <Box
      aria-hidden="true"
      style={{
        height: active ? '0.75rem' : '0.25rem',
        display: 'flex',
        alignItems: 'center',
        paddingInline: active ? '0.25rem' : 0,
        transition: 'all 0.15s ease'
      }}
    >
      {active && (
        <Box
          style={{
            position: 'relative',
            width: '100%',
            height: '0.75rem',
            backgroundColor: 'var(--focus-soft)',
            border: '1px solid var(--focus)',
            borderRadius: '0.25rem'
          }}
        >
          <Box
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '0.5rem',
              height: '0.5rem',
              backgroundColor: 'var(--focus)',
              border: '2px solid var(--surface-1)',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          />
        </Box>
      )}
    </Box>
  );
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
  const [dragStatus, setDragStatus] = useState('');
  const dragMetaRef = useRef<{ fromIndex: number; pointerId: number } | null>(null);
  const dragInsertIndexRef = useRef<number | null>(null);
  const orderedLayersRef = useRef(orderedLayers);
  const rowRefsRef = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    orderedLayersRef.current = orderedLayers;
  }, [orderedLayers]);

  // Move layer to new position
  const moveLayerTo = (fromIndex: number, toIndex: number) => {
    setOrderedLayers(moveLayer(orderedLayers, fromIndex, toIndex));
  };

  // Move layer up
  const handleMoveUp = (index: number) => {
    if (index > 0) {
      moveLayerTo(index, index - 1);
    }
  };

  // Move layer down
  const handleMoveDown = (index: number) => {
    if (index < orderedLayers.length - 1) {
      moveLayerTo(index, index + 2);
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
    setDragInsertIndex(index);
    dragInsertIndexRef.current = index;
    setDragStatus(`Moving ${orderedLayers[index].name}. Position ${index + 1} of ${orderedLayers.length}.`);
    dragMetaRef.current = {
      fromIndex: index,
      pointerId: e.pointerId
    };

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (activeDragIndex === null) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dragMeta = dragMetaRef.current;
      if (!dragMeta || e.pointerId !== dragMeta.pointerId) return;

      const layers = orderedLayersRef.current;
      let insertIndex = dragMeta.fromIndex;

      for (let i = 0; i < layers.length; i++) {
        const row = rowRefsRef.current[i];
        if (!row) continue;

        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint && i < dragMeta.fromIndex) {
          insertIndex = i;
        } else if (e.clientY > midpoint && i > dragMeta.fromIndex) {
          insertIndex = i + 1;
        }
      }

      if (insertIndex !== dragInsertIndexRef.current) {
        const adjustedIndex = insertIndex > dragMeta.fromIndex ? insertIndex - 1 : insertIndex;
        setDragStatus(
          `Moving ${layers[dragMeta.fromIndex].name}. Preview position ${adjustedIndex + 1} of ${layers.length}.`
        );
        dragInsertIndexRef.current = insertIndex;
        setDragInsertIndex(insertIndex);
      }
    };

    const finishDrag = (e: PointerEvent) => {
      const dragMeta = dragMetaRef.current;
      if (!dragMeta || e.pointerId !== dragMeta.pointerId) return;

      const insertIndex = dragInsertIndexRef.current;
      const layers = orderedLayersRef.current;
      if (insertIndex !== null && insertIndex !== dragMeta.fromIndex) {
        setOrderedLayers(moveLayer(layers, dragMeta.fromIndex, insertIndex));
        const adjustedIndex = insertIndex > dragMeta.fromIndex ? insertIndex - 1 : insertIndex;
        setDragStatus(`${layers[dragMeta.fromIndex].name} moved to position ${adjustedIndex + 1} of ${layers.length}.`);
      }

      dragMetaRef.current = null;
      dragInsertIndexRef.current = null;
      setActiveDragIndex(null);
      setDragInsertIndex(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [activeDragIndex, setOrderedLayers]);

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
        <Text style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
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
                <DropSlot active={isInsertPoint && activeDragIndex !== null} />

                {/* Layer row */}
                <Flex
                  gap="2"
                  style={{
                    padding: '1rem',
                    backgroundColor: isDragging ? 'var(--focus-soft)' : 'var(--surface-2)',
                    border: `1px solid ${isDragging ? 'var(--focus)' : 'var(--border-default)'}`,
                    borderRadius: '0.375rem',
                    alignItems: 'center',
                    cursor: activeDragIndex !== null ? 'grabbing' : 'grab',
                    touchAction: activeDragIndex !== null ? 'none' : 'auto',
                    transition: 'all 0.15s',
                    opacity: activeDragIndex === index ? 0.7 : 1
                  }}
                  onPointerDown={(e) => handlePointerDown(index, e)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Layer ${layer.name}, position ${index + 1} of ${orderedLayers.length}`}
                >
                  {/* Drag Handle */}
                  <Box style={{ color: 'var(--text-tertiary)', flexShrink: 0, cursor: 'grab' }}>
                    <GripVertical size={18} />
                  </Box>

                  {/* Layer Info */}
                  <Stack gap="1" style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>{layer.name}</Text>
                    <Text style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
                        color: isBottom ? 'var(--text-tertiary)' : 'var(--text-secondary)'
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
                        color: isTop ? 'var(--text-tertiary)' : 'var(--text-secondary)'
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
                        color: 'var(--negative)'
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

          <DropSlot active={dragInsertIndex === orderedLayers.length && activeDragIndex !== null} />
        </Stack>
      )}

      <Box
        aria-live="polite"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        {dragStatus}
      </Box>

      {/* Info */}
      <Text style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
        💡 Tip: Use drag handle, arrow keys, or buttons to reorder. Bottom layer renders first, top layer on top.
      </Text>
    </Stack>
  );
}
