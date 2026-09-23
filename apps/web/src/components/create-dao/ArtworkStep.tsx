// components/create-dao/ArtworkStep.tsx

'use client';

import { Trash2 } from 'lucide-react';
import { Stack } from 'styled-system/jsx';

import { Badge, Button, Card, Heading, Input, Text } from '@/components/ui';
import { hasDuplicates, isValidIpfsUri, validateArtworkProperty } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function ArtworkStep() {
  const artwork = useCreateDaoStore((s) => s.artwork);
  const updateArtwork = useCreateDaoStore((s) => s.updateArtwork);
  const addArtworkProperty = useCreateDaoStore((s) => s.addArtworkProperty);
  const removeArtworkProperty = useCreateDaoStore((s) => s.removeArtworkProperty);
  const updateArtworkProperty = useCreateDaoStore((s) => s.updateArtworkProperty);
  const addArtworkItem = useCreateDaoStore((s) => s.addArtworkItem);
  const removeArtworkItem = useCreateDaoStore((s) => s.removeArtworkItem);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);

  const handleBaseUriChange = (value: string) => {
    updateArtwork({ ipfs: { ...artwork.ipfs, baseUri: value } });
    if (!value.trim()) {
      setValidationError('ipfsBaseUri', 'IPFS base URI is required');
    } else if (!isValidIpfsUri(value)) {
      setValidationError('ipfsBaseUri', 'IPFS base URI must start with ipfs:// or be a valid IPFS gateway URL');
    } else {
      clearValidationError('ipfsBaseUri');
    }
  };

  const handleExtensionChange = (value: string) => {
    updateArtwork({ ipfs: { ...artwork.ipfs, extension: value } });
    if (!value.trim()) {
      setValidationError('ipfsExtension', 'File extension is required (e.g., .png)');
    } else if (!value.startsWith('.')) {
      setValidationError('ipfsExtension', 'File extension must start with a dot (e.g., .png)');
    } else {
      clearValidationError('ipfsExtension');
    }
  };

  const validateProperties = () => {
    const currentArtwork = useCreateDaoStore.getState().artwork;
    if (currentArtwork.properties.length === 0) {
      setValidationError('artworkProperties', 'At least one artwork property is required');
      return;
    }
    if (currentArtwork.properties.length > 16) {
      setValidationError('artworkProperties', 'Maximum 16 artwork properties allowed');
      return;
    }

    // Validate each property
    let hasErrors = false;
    currentArtwork.properties.forEach((property, index) => {
      const error = validateArtworkProperty(property);
      if (error) {
        setValidationError(`artworkProperty${index}`, `Property ${index + 1}: ${error}`);
        hasErrors = true;
      } else {
        clearValidationError(`artworkProperty${index}`);
      }
    });

    // Check for duplicate property names
    if (hasDuplicates(currentArtwork.properties, (p) => p.name.toLowerCase())) {
      setValidationError('artworkProperties', 'Duplicate property names are not allowed');
      hasErrors = true;
    } else if (!hasErrors) {
      clearValidationError('artworkProperties');
    }
  };

  const handlePropertyNameChange = (
    propertyIndex: number,
    property: { name: string; items: string[] },
    value: string
  ) => {
    updateArtworkProperty(propertyIndex, { ...property, name: value });
    setTimeout(validateProperties, 0);
  };

  const handlePropertyItemChange = (
    propertyIndex: number,
    property: { name: string; items: string[] },
    items: string[]
  ) => {
    updateArtworkProperty(propertyIndex, { ...property, items });
    setTimeout(validateProperties, 0);
  };

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <Heading as="h2" style={{ fontSize: '1.25rem' }}>
            IPFS Configuration
          </Heading>

          <Stack gap="2">
            <label htmlFor="ipfsBaseUri">
              <Text style={{ fontWeight: 600 }}>IPFS Base URI *</Text>
            </label>
            <Input
              id="ipfsBaseUri"
              value={artwork.ipfs.baseUri}
              onChange={(e) => handleBaseUriChange(e.target.value)}
              placeholder="ipfs://Qm.../  or  https://ipfs.io/ipfs/Qm.../"
            />
            {validationErrors.ipfsBaseUri && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.ipfsBaseUri}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Base URI where artwork files are stored on IPFS
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="ipfsExtension">
              <Text style={{ fontWeight: 600 }}>File Extension</Text>
            </label>
            <Input
              id="ipfsExtension"
              value={artwork.ipfs.extension}
              onChange={(e) => handleExtensionChange(e.target.value)}
              placeholder=".png"
            />
            {validationErrors.ipfsExtension && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.ipfsExtension}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              File extension for artwork files (e.g., .png, .jpg, .svg)
            </Text>
          </Stack>
        </Stack>
      </Card>

      <Card p="5">
        <Stack gap="4">
          <div>
            <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              Artwork Properties
              {artwork.properties.length > 0 && (
                <Badge style={{ marginLeft: '8px' }}>{artwork.properties.length} / 16</Badge>
              )}
            </Heading>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Define the traits that make up your DAO&apos;s artwork. Maximum 16 properties.
            </Text>
          </div>

          {validationErrors.properties && (
            <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.properties}</Text>
          )}

          {artwork.properties.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                border: '1px dashed var(--gray-6)',
                borderRadius: '8px'
              }}
            >
              <Text style={{ color: 'var(--gray-11)', marginBottom: '1rem' }}>No properties added yet</Text>
              <Button onClick={addArtworkProperty} disabled={artwork.properties.length >= 16}>
                Add First Property
              </Button>
            </div>
          ) : (
            <>
              <Stack gap="4">
                {artwork.properties.map((property, propertyIndex) => (
                  <Card
                    key={propertyIndex}
                    p="4"
                    style={{ background: 'var(--gray-2)', border: '1px solid var(--gray-6)' }}
                  >
                    <Stack gap="3">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontWeight: 600 }}>Property {propertyIndex + 1}</Text>
                        <Button
                          variant="outline"
                          onClick={() => removeArtworkProperty(propertyIndex)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.875rem',
                            color: 'var(--error-9)'
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>

                      <Stack gap="2">
                        <label htmlFor={`property-name-${propertyIndex}`}>
                          <Text style={{ fontSize: '0.875rem', fontWeight: 500 }}>Property Name</Text>
                        </label>
                        <Input
                          id={`property-name-${propertyIndex}`}
                          value={property.name}
                          onChange={(e) => handlePropertyNameChange(propertyIndex, property, e.target.value)}
                          placeholder="e.g., 0-backgrounds or 1-bodies"
                        />
                        {validationErrors[`artworkProperty${propertyIndex}`] && (
                          <Text style={{ color: 'var(--error-9)', fontSize: '0.75rem' }}>
                            {validationErrors[`artworkProperty${propertyIndex}`]}
                          </Text>
                        )}
                        <Text style={{ color: 'var(--gray-11)', fontSize: '0.75rem' }}>
                          Prefix with number for ordering (e.g., 0-backgrounds, 1-bodies)
                        </Text>
                      </Stack>

                      <Stack gap="2">
                        <Text style={{ fontSize: '0.875rem', fontWeight: 500 }}>Items ({property.items.length})</Text>

                        {property.items.map((item, itemIndex) => (
                          <div key={itemIndex} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Input
                              value={item}
                              onChange={(e) => {
                                const items = [...property.items];
                                items[itemIndex] = e.target.value;
                                handlePropertyItemChange(propertyIndex, property, items);
                              }}
                              placeholder="Item name"
                              style={{ flex: 1 }}
                            />
                            <Button
                              variant="outline"
                              onClick={() => removeArtworkItem(propertyIndex, itemIndex)}
                              style={{
                                padding: '8px 12px',
                                color: 'var(--error-9)'
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        ))}

                        <Button
                          variant="outline"
                          onClick={() => addArtworkItem(propertyIndex, '')}
                          style={{ fontSize: '0.875rem' }}
                        >
                          + Add Item
                        </Button>
                      </Stack>
                    </Stack>
                  </Card>
                ))}
              </Stack>

              <Button onClick={addArtworkProperty} disabled={artwork.properties.length >= 16}>
                + Add Property
              </Button>
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
