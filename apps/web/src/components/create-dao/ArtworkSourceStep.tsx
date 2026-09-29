'use client';

import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { ArtworkDirectoryUpload } from '@/components/create-dao/ArtworkDirectoryUpload';
import { ArtworkPlayground } from '@/components/create-dao/ArtworkPlayground';
import { ArtworkPreviewCanvas } from '@/components/create-dao/ArtworkPreviewCanvas';
import { Badge, Button, Card, Heading, Text } from '@/components/ui';
import { cidToUrls } from '@/lib/pinata-upload';
import { getAvailableCollections, getStarterCollection } from '@/lib/starter-collections';
import { ArtworkSource, useCreateDaoStore } from '@/stores/create-dao-store';

function starterSource(collection: ReturnType<typeof getStarterCollection>) {
  if (!collection) return null;

  return {
    kind: 'starter' as const,
    starterId: collection.id,
    baseUri: collection.baseUri,
    extension: collection.extension,
    properties: collection.properties,
    gatewayUrl: collection.baseUri.startsWith('ipfs://')
      ? cidToUrls(collection.baseUri.replace('ipfs://', '').replace(/\/$/, '')).gatewayUrl
      : collection.baseUri
  };
}

export function ArtworkSourceStep() {
  const artworkSource = useCreateDaoStore((s) => s.artworkSource);
  const setArtworkSource = useCreateDaoStore((s) => s.setArtworkSource);
  const clearArtworkSource = useCreateDaoStore((s) => s.clearArtworkSource);

  const [uploadMode, setUploadMode] = useState(false);
  const [playgroundMode, setPlaygroundMode] = useState(false);

  const starterCollections = getAvailableCollections();

  // Handle starter collection selection
  const handleSelectStarter = (collectionId: string) => {
    const collection = getStarterCollection(collectionId);
    const source = starterSource(collection);
    if (source) {
      setArtworkSource(source);
      // Show playground for layer ordering
      setPlaygroundMode(true);
    }
  };

  // Handle upload completion
  const handleUploadComplete = (source: ArtworkSource) => {
    if (source.kind === 'uploaded') {
      setArtworkSource(source);
      setUploadMode(false);
      // Show playground for layer ordering and preview
      setPlaygroundMode(true);
    }
  };

  // Handle playground completion (when user finalizes layer ordering)
  const handlePlaygroundComplete = (finalSource: ArtworkSource) => {
    setArtworkSource(finalSource);
    setPlaygroundMode(false);
  };

  // Back from playground
  const handlePlaygroundBack = () => {
    setPlaygroundMode(false);
  };

  const handleChangeSelection = () => {
    clearArtworkSource();
    setPlaygroundMode(false);
  };

  // Get the current selection description
  const getSelectionDescription = () => {
    if (!artworkSource || artworkSource.kind === 'legacy-unconfirmed') {
      return null;
    }
    if (artworkSource.kind === 'starter') {
      const collection = starterCollections.find((c) => c.id === artworkSource.starterId);
      return collection ? (
        <Box>
          <Text style={{ fontWeight: 600 }}>{collection.name}</Text>
          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>{collection.description}</Text>
          <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)', marginTop: '0.5rem' }}>
            License: {collection.license} • {collection.attribution}
          </Text>
        </Box>
      ) : null;
    }
    if (artworkSource.kind === 'uploaded') {
      return (
        <Box>
          <Text style={{ fontWeight: 600 }}>Custom Uploaded Collection</Text>
          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
            {artworkSource.properties.length} properties, {artworkSource.extension} format
          </Text>
        </Box>
      );
    }
  };

  return (
    <Stack gap="4">
      {/* Current Selection Display */}
      {artworkSource && artworkSource.kind !== 'legacy-unconfirmed' && !playgroundMode && (
        <Card p="5" style={{ backgroundColor: 'var(--info-2)' }}>
          <Stack gap="3">
            <Flex gap="2" style={{ alignItems: 'center' }}>
              <Badge style={{ backgroundColor: 'var(--info-9)', color: 'white' }}>Selected</Badge>
              <Heading as="h3" style={{ fontSize: '1rem' }}>
                Your artwork
              </Heading>
            </Flex>
            {getSelectionDescription()}
            <Flex gap="2" style={{ flexWrap: 'wrap' }}>
              <Button onClick={() => setPlaygroundMode(true)} style={{ width: 'fit-content' }}>
                Preview and organize layers
              </Button>
              <Button variant="outline" onClick={handleChangeSelection} style={{ width: 'fit-content' }}>
                Choose different artwork
              </Button>
            </Flex>
          </Stack>
        </Card>
      )}

      {/* Source Selection Screen */}
      {(!artworkSource || artworkSource.kind === 'legacy-unconfirmed') && !uploadMode && !playgroundMode && (
        <Card p="5">
          <Stack gap="4">
            <Stack gap="2">
              <Heading as="h2" style={{ fontSize: '1.25rem' }}>
                How do you want to start your collection?
              </Heading>
              <Text style={{ color: 'var(--gray-11)' }}>
                Choose from curated collections or upload your own artwork directory
              </Text>
            </Stack>

            <Stack gap="4">
              {/* Starter Collections */}
              <Stack gap="3">
                <Heading as="h3" style={{ fontSize: '1rem' }}>
                  Starter Collections
                </Heading>
                <Flex gap="3" style={{ flexWrap: 'wrap' }}>
                  {starterCollections.map((collection) => (
                    <Card
                      key={collection.id}
                      p="4"
                      style={{
                        flex: '0 1 calc(50% - 0.75rem)',
                        minWidth: '250px',
                        border: '1px solid var(--gray-6)'
                      }}
                    >
                      <Stack gap="3">
                        {/* Preview Render */}
                        {starterSource(collection) ? (
                          <ArtworkPreviewCanvas
                            source={starterSource(collection)!}
                            orderedLayers={collection.properties}
                            showShuffle={false}
                          />
                        ) : null}

                        {/* Collection Info */}
                        <Stack gap="2">
                          <Text style={{ fontWeight: 600 }}>{collection.name}</Text>
                          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                            {collection.description}
                          </Text>
                          <Flex gap="2" style={{ flexWrap: 'wrap', marginTop: '0.5rem' }}>
                            <Badge>{collection.properties.length} traits</Badge>
                            <Badge>{collection.license}</Badge>
                          </Flex>
                          <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)' }}>{collection.attribution}</Text>
                        </Stack>

                        {/* Select Button */}
                        <Button onClick={() => handleSelectStarter(collection.id)} style={{ width: '100%' }}>
                          Select Collection
                        </Button>
                      </Stack>
                    </Card>
                  ))}
                </Flex>
              </Stack>

              {/* Upload Option - Only shown when Pinata uploads are enabled */}
              {process.env.NEXT_PUBLIC_PINATA_UPLOADS_ENABLED === 'true' && (
                <Stack gap="3">
                  <Heading as="h3" style={{ fontSize: '1rem' }}>
                    Upload Your Collection
                  </Heading>
                  <Card p="4" style={{ border: '2px dashed var(--gray-6)' }}>
                    <Stack gap="3">
                      <Flex style={{ justifyContent: 'center', alignItems: 'center' }}>
                        <Upload size={32} style={{ color: 'var(--gray-10)' }} />
                      </Flex>
                      <Stack gap="2" style={{ textAlign: 'center' }}>
                        <Text style={{ fontWeight: 600 }}>Upload Your Own Collection</Text>
                        <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                          Upload a directory of trait assets in PNG/WebP format
                        </Text>
                        <Text style={{ fontSize: '0.75rem', color: 'var(--gray-10)' }}>
                          Required layout: collection/trait-name/item-name.png
                        </Text>
                      </Stack>
                      <Button onClick={() => setUploadMode(true)} style={{ width: '100%' }}>
                        Upload Directory
                      </Button>
                    </Stack>
                  </Card>
                </Stack>
              )}
            </Stack>
          </Stack>
        </Card>
      )}

      {/* Upload Mode */}
      {uploadMode && <ArtworkDirectoryUpload onComplete={handleUploadComplete} onCancel={() => setUploadMode(false)} />}

      {/* Playground Mode - Layer ordering and preview for both starter and uploaded collections */}
      {playgroundMode && artworkSource && (artworkSource.kind === 'starter' || artworkSource.kind === 'uploaded') && (
        <ArtworkPlayground source={artworkSource} onComplete={handlePlaygroundComplete} onBack={handlePlaygroundBack} />
      )}
    </Stack>
  );
}
