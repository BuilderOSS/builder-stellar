'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Button, Text } from '@/components/ui';
import { ArtworkProperty } from '@/stores/create-dao-store';

export interface TraitSelectorProps {
  properties: ArtworkProperty[];
  selectedTraits: Record<string, string>;
  onTraitsChange: (traits: Record<string, string>) => void;
}

/**
 * Trait selector component for previewing artwork with specific trait combinations.
 *
 * Features:
 * - Select different trait values per layer
 * - Persist selections for preview updates
 * - Expandable trait lists with smooth animations
 * - Random trait selector button
 */
export function TraitSelector({ properties, selectedTraits, onTraitsChange }: TraitSelectorProps) {
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});

  const toggleLayerExpansion = (layerName: string) => {
    setExpandedLayers((prev) => ({
      ...prev,
      [layerName]: !prev[layerName]
    }));
  };

  const handleTraitSelect = (layerName: string, itemName: string) => {
    onTraitsChange({
      ...selectedTraits,
      [layerName]: itemName
    });
  };

  const handleRandomTraits = () => {
    const newTraits: Record<string, string> = {};
    for (const property of properties) {
      if (property.items.length > 0) {
        const randomIndex = Math.floor(Math.random() * property.items.length);
        newTraits[property.name] = property.items[randomIndex];
      }
    }
    onTraitsChange(newTraits);
  };

  return (
    <Stack gap="3">
      <Flex style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Trait Selection</Text>
        <Button size="sm" onClick={handleRandomTraits} style={{ fontSize: '0.75rem' }}>
          Randomize
        </Button>
      </Flex>

      <Stack gap="2">
        {properties.map((property) => {
          const isExpanded = expandedLayers[property.name];
          const selectedItem = selectedTraits[property.name];

          return (
            <motion.div key={property.name} layout>
              <Box
                style={{
                  border: '1px solid var(--gray-6)',
                  borderRadius: '0.375rem',
                  overflow: 'hidden'
                }}
              >
                {/* Layer Header */}
                <motion.button
                  onClick={() => toggleLayerExpansion(property.name)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: 'var(--gray-2)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.2s'
                  }}
                  whileHover={{ backgroundColor: 'var(--gray-3)' }}
                  whileTap={{ backgroundColor: 'var(--gray-4)' }}
                >
                  <Flex style={{ gap: '0.5rem', alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1, textAlign: 'left' }}>
                      {property.name}
                    </Text>
                    {selectedItem && (
                      <Text
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--gray-11)',
                          fontWeight: 400
                        }}
                      >
                        {selectedItem}
                      </Text>
                    )}
                  </Flex>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ flexShrink: 0 }}
                  >
                    <ChevronDown size={16} style={{ color: 'var(--gray-11)' }} />
                  </motion.div>
                </motion.button>

                {/* Trait Items */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <Stack
                        gap="1"
                        style={{
                          padding: '0.5rem',
                          borderTop: '1px solid var(--gray-6)',
                          backgroundColor: 'var(--gray-1)',
                          maxHeight: '300px',
                          overflowY: 'auto'
                        }}
                      >
                        {property.items.map((item) => {
                          const isSelected = selectedItem === item;

                          return (
                            <motion.button
                              key={item}
                              onClick={() => handleTraitSelect(property.name, item)}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              transition={{ duration: 0.15 }}
                              style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                backgroundColor: isSelected ? 'var(--info-3)' : 'transparent',
                                border: isSelected ? '1px solid var(--info-9)' : '1px solid transparent',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: '0.75rem',
                                transition: 'all 0.2s'
                              }}
                              whileHover={{
                                backgroundColor: isSelected ? 'var(--info-4)' : 'var(--gray-3)',
                                borderColor: isSelected ? 'var(--info-9)' : 'var(--gray-6)'
                              }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Text
                                style={{ fontSize: '0.75rem', color: isSelected ? 'var(--info-9)' : 'var(--gray-11)' }}
                              >
                                {item}
                              </Text>
                            </motion.button>
                          );
                        })}
                      </Stack>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Box>
            </motion.div>
          );
        })}
      </Stack>
    </Stack>
  );
}
