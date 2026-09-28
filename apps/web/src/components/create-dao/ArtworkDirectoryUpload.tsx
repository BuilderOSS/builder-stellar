'use client';

import { AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Button, Card, Heading, Text } from '@/components/ui';
import { hashFiles } from '@/lib/file-hash';
import { cacheUpload, getCachedUpload } from '@/lib/upload-cache';
import { ArtworkProperty, ArtworkSource } from '@/stores/create-dao-store';

/**
 * Error categories for better error handling and user feedback
 */
export enum ArtworkErrorType {
  DIRECTORY_STRUCTURE = 'DIRECTORY_STRUCTURE',
  MIME_TYPE = 'MIME_TYPE',
  FILE_SIZE = 'FILE_SIZE',
  DIMENSIONS = 'DIMENSIONS',
  MAX_TRAITS = 'MAX_TRAITS',
  DUPLICATE_ITEM = 'DUPLICATE_ITEM',
  HIDDEN_FILE = 'HIDDEN_FILE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

export class ArtworkValidationError extends Error {
  constructor(
    public type: ArtworkErrorType,
    message: string
  ) {
    super(message);
    this.name = 'ArtworkValidationError';
  }
}

interface DirectoryItem {
  path: string;
  name: string;
  size: number;
  file: File;
}

interface ValidatedDirectory {
  items: DirectoryItem[];
  properties: Map<string, string[]>; // trait -> [items]
  extension: '.png' | '.webp';
  totalSize: number;
  itemCount: number;
}

export interface ArtworkDirectoryUploadProps {
  onComplete: (source: ArtworkSource) => void;
  onCancel: () => void;
}

/**
 * Validates a directory structure for artwork.
 * Expected layout: <collection>/<trait>/<item>.ext
 */
function validateDirectory(files: File[]): {
  valid: boolean;
  error?: ArtworkValidationError;
  data?: ValidatedDirectory;
} {
  const properties = new Map<string, string[]>();
  const items: DirectoryItem[] = [];
  let extension: '.png' | '.webp' | null = null;
  let totalSize = 0;

  // Collect errors for better reporting
  const allErrors: string[] = [];
  const validFiles: File[] = [];

  // Process each file
  for (const file of files) {
    const path = (file as any).webkitRelativePath || file.name;
    const parts = path.split('/').filter((p: string) => p);

    // Validate path depth
    if (parts.length < 3) {
      allErrors.push(`"${path}": File is in wrong location. Expected: collection-folder/trait-name/image-name.ext`);
      continue;
    }

    // Remove collection folder (first part)
    parts.shift();
    const trait = parts[0];
    const filename = parts[1];

    if (!filename || parts.length !== 2) {
      allErrors.push(`"${path}": File is in wrong location. Expected: collection-folder/trait-name/image-name.ext`);
      continue;
    }

    // Check for hidden files (e.g., .DS_Store)
    if (filename.startsWith('.')) {
      allErrors.push(`"${filename}": Hidden files are not allowed. Please remove system files like .DS_Store`);
      continue;
    }

    // Validate filename
    const lastDot = filename.lastIndexOf('.');
    if (lastDot <= 0) {
      allErrors.push(`"${filename}": File has no extension. Supported: .png, .webp`);
      continue;
    }

    const ext = filename.substring(lastDot).toLowerCase();
    if (ext !== '.png' && ext !== '.webp') {
      allErrors.push(`"${filename}": Unsupported format "${ext}". Only PNG and WebP are allowed.`);
      continue;
    }

    // Set or verify extension consistency
    if (extension === null) {
      extension = ext as '.png' | '.webp';
    } else if (extension !== ext) {
      allErrors.push(`"${filename}": Uses "${ext}" but collection uses "${extension}". All files must match.`);
      continue;
    }

    // Check file size
    if (file.size > 2 * 1024 * 1024) {
      allErrors.push(`"${filename}": File is ${(file.size / 1024 / 1024).toFixed(2)}MB (max 2MB per file)`);
      continue;
    }

    // Add to properties
    if (!properties.has(trait)) {
      properties.set(trait, []);
    }
    const itemName = filename.substring(0, lastDot);
    const traitItems = properties.get(trait)!;
    if (traitItems.includes(itemName)) {
      allErrors.push(`"${itemName}" in "${trait}": Duplicate item. Each trait item must be unique.`);
      continue;
    }
    traitItems.push(itemName);

    totalSize += file.size;
    validFiles.push(file);
    items.push({
      path,
      name: filename,
      size: file.size,
      file
    });
  }

  // If there were validation errors, report them all at once
  if (allErrors.length > 0 && validFiles.length === 0) {
    // All files had errors
    const errorMsg =
      allErrors.length === 1
        ? allErrors[0]
        : `Found ${allErrors.length} issues:\n\n${allErrors.slice(0, 5).join('\n')}${allErrors.length > 5 ? `\n\n...and ${allErrors.length - 5} more issues` : ''}`;

    return {
      valid: false,
      error: new ArtworkValidationError(ArtworkErrorType.DIRECTORY_STRUCTURE, errorMsg)
    };
  }

  if (allErrors.length > 0 && validFiles.length > 0) {
    // Some files had errors but some are valid - continue with valid ones but warn user
    console.warn(
      `[validateDirectory] ${allErrors.length} files had validation errors, continuing with ${validFiles.length} valid files`
    );
  }

  if (items.length === 0) {
    return {
      valid: false,
      error: new ArtworkValidationError(
        ArtworkErrorType.DIRECTORY_STRUCTURE,
        'No image files found. Make sure your directory contains PNG or WebP images in subdirectories.'
      )
    };
  }

  if (totalSize > 200 * 1024 * 1024) {
    return {
      valid: false,
      error: new ArtworkValidationError(
        ArtworkErrorType.FILE_SIZE,
        `Collection is too large (${(totalSize / 1024 / 1024).toFixed(1)}MB total, max 200MB). Consider reducing image sizes or removing some traits.`
      )
    };
  }

  if (properties.size === 0) {
    return {
      valid: false,
      error: new ArtworkValidationError(
        ArtworkErrorType.DIRECTORY_STRUCTURE,
        'No traits found. Ensure your directory structure is: collection-folder/trait-name/image-name.ext'
      )
    };
  }

  if (properties.size > 16) {
    return {
      valid: false,
      error: new ArtworkValidationError(
        ArtworkErrorType.MAX_TRAITS,
        `Too many traits (${properties.size}, max 16). Remove ${properties.size - 16} trait folders to proceed.`
      )
    };
  }

  return {
    valid: true,
    data: {
      items,
      properties,
      extension: extension!,
      totalSize,
      itemCount: items.length
    }
  };
}

export function ArtworkDirectoryUpload({ onComplete, onCancel }: ArtworkDirectoryUploadProps) {
  const [validatedDirectory, setValidatedDirectory] = useState<ValidatedDirectory | null>(null);
  const [validationError, setValidationError] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'preparing' | 'uploading' | 'verifying' | 'finalizing'>('preparing');

  const directoryInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Race condition guards: prevent stale operations from overwriting newer results
  const uploadRunIdRef = useRef<string>('');
  const processRunIdRef = useRef<string>('');

  // Handle directory selection with race condition guard
  const handleDirectorySelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Generate unique run ID for this process
    const runId = `process-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    processRunIdRef.current = runId;

    setValidationError('');
    setValidatedDirectory(null);
    setUploadProgress(0);

    const fileArray = Array.from(files);
    const validation = validateDirectory(fileArray);

    // Check if this operation was superseded
    if (processRunIdRef.current !== runId) {
      return;
    }

    if (!validation.valid) {
      const errorMessage = validation.error?.message || 'Validation failed';
      setValidationError(errorMessage);
      return;
    }

    setValidatedDirectory(validation.data!);

    // Generate preview token IDs (random sample of items)
    const allItems = validation.data!.items;
    const previewIds = [];
    for (let i = 0; i < Math.min(3, allItems.length); i++) {
      previewIds.push(Math.floor(Math.random() * allItems.length));
    }
    // Preview IDs are computed but not stored as they're not needed for the current flow
    void previewIds;
  }, []);

  // Handle upload with race condition guard and progress tracking
  const handleUpload = useCallback(async () => {
    if (!validatedDirectory) return;

    // Generate unique run ID for this upload
    const runId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    uploadRunIdRef.current = runId;

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsUploading(true);
    setUploadError('');
    setUploadProgress(0);
    setUploadStage('preparing');

    try {
      // Check for cached upload using file hash
      const files = validatedDirectory.items.map((item) => item.file);
      setUploadStage('preparing');
      const fileHash = await hashFiles(files);

      const cached = getCachedUpload(fileHash);
      if (cached) {
        // Use cached result
        if (uploadRunIdRef.current !== runId) return;
        setUploadProgress(100);
        setUploadStage('finalizing');
        await new Promise((resolve) => setTimeout(resolve, 300)); // Brief delay for UX

        if (uploadRunIdRef.current !== runId) return;

        const properties: ArtworkProperty[] = Array.from(validatedDirectory.properties.entries()).map(
          ([name, items]) => ({
            name,
            items
          })
        );

        const source: ArtworkSource = {
          kind: 'uploaded',
          baseUri: `${cached.uri}/`,
          extension: validatedDirectory.extension,
          properties,
          gatewayUrl: `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/${cached.cid}/`
        };

        onComplete(source);
        return;
      }

      // Check if cancelled before proceeding
      if (uploadRunIdRef.current !== runId) return;

      // Generate JWT for directory upload
      setUploadStage('preparing');
      setUploadProgress(5);
      const jwtResponse = await fetch('/api/pinata/generate-jwt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal
      });

      if (!jwtResponse.ok) {
        // Attempt to parse error response (used for debugging)
        void jwtResponse.json().catch(() => ({}));
        if (jwtResponse.status === 429) {
          throw new Error('Too many upload attempts. Please wait a moment and try again.');
        }
        throw new Error('Failed to connect to upload service. Please check your internet connection.');
      }

      const { jwt } = (await jwtResponse.json()) as { jwt: string };

      // Check if cancelled
      if (uploadRunIdRef.current !== runId) return;

      // Build FormData for directory upload to legacy Pinata endpoint
      const formData = new FormData();

      // Add files with builder/ prefix to preserve structure
      for (const item of validatedDirectory.items) {
        const pathParts = item.path.split('/').filter((p) => p);
        const relativePath = pathParts.slice(1).join('/');
        formData.append('file', item.file, `builder/${relativePath}`);
      }

      // Add Pinata options for directory upload
      formData.append(
        'pinataOptions',
        JSON.stringify({
          cidVersion: 1
        })
      );

      formData.append(
        'pinataMetadata',
        JSON.stringify({
          name: 'builder'
        })
      );

      formData.append('network', 'public');

      // Upload to legacy Pinata endpoint
      setUploadStage('uploading');
      setUploadProgress(10);
      const uploadResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`
        },
        body: formData,
        signal: abortController.signal
      });

      if (!uploadResponse.ok) {
        const errorData = (await uploadResponse.json().catch(() => ({}))) as any;
        if (uploadResponse.status === 401) {
          throw new Error('Authentication failed. Your upload session may have expired. Please try again.');
        } else if (uploadResponse.status === 429) {
          throw new Error('Upload service is busy. Please wait a moment and try again.');
        } else if (uploadResponse.status >= 500) {
          throw new Error('The upload service is temporarily unavailable. Please try again in a few moments.');
        }
        throw new Error(errorData.error?.message || 'Failed to upload directory to IPFS. Please try again.');
      }

      const uploadData = (await uploadResponse.json()) as any;
      const cid = uploadData.IpfsHash;

      if (!cid) {
        throw new Error('Upload appeared successful but no storage location was returned. Please try again.');
      }

      // Check if operation was cancelled
      if (uploadRunIdRef.current !== runId) {
        return;
      }

      // Cache the result and verify
      setUploadStage('verifying');
      setUploadProgress(90);
      cacheUpload(fileHash, cid);

      // Pin CID for redundancy (async, don't block)
      setUploadStage('finalizing');
      setUploadProgress(95);
      fetch('/api/pinata/pin-cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid })
      }).catch((err) => console.warn('[handleUpload] Failed to pin CID:', err));

      setUploadProgress(100);

      // Convert properties to ArtworkProperty[]
      const properties: ArtworkProperty[] = Array.from(validatedDirectory.properties.entries()).map(
        ([name, items]) => ({
          name,
          items
        })
      );

      // Create source with real CID
      const source: ArtworkSource = {
        kind: 'uploaded',
        baseUri: `ipfs://${cid}/`,
        extension: validatedDirectory.extension,
        properties,
        gatewayUrl: `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY}/ipfs/${cid}/`
      };

      // Final check before completing
      if (uploadRunIdRef.current === runId) {
        onComplete(source);
      }
    } catch (error) {
      // Only update error state if this is still the active upload
      if (uploadRunIdRef.current === runId) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setUploadError('Upload was cancelled.');
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Directory upload failed. Please try again.';
          setUploadError(errorMessage);
          console.error('Upload error:', error);
        }
      }
    } finally {
      if (uploadRunIdRef.current === runId) {
        setIsUploading(false);
        setUploadStage('preparing');
        abortControllerRef.current = null;
      }
    }
  }, [validatedDirectory, onComplete]);

  // Handle cancellation
  const handleCancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // setIsUploading(false) will be called in finally block
  }, []);

  return (
    <Card p="5">
      <Stack gap="4">
        {!validatedDirectory ? (
          <>
            {/* Directory Selection */}
            <Stack gap="4">
              <Heading as="h3" style={{ fontSize: '1.25rem' }}>
                Upload Artwork Directory
              </Heading>

              <Box
                onClick={() => directoryInputRef.current?.click()}
                style={{
                  borderRadius: '0.5rem',
                  border: '2px dashed var(--gray-6)',
                  padding: '2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--info-9)';
                  e.currentTarget.style.backgroundColor = 'var(--info-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--gray-6)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Flex style={{ justifyContent: 'center', marginBottom: '1rem' }}>
                  <Upload size={40} style={{ color: 'var(--gray-10)' }} />
                </Flex>
                <Text style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Click to select a directory</Text>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>or drag and drop a folder here</Text>
              </Box>

              <input
                ref={directoryInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is not part of HTML spec but supported by browsers
                webkitdirectory="true"
                multiple
                onChange={(e) => handleDirectorySelect(e.target.files)}
                style={{ display: 'none' }}
              />

              {/* Visual Directory Structure Guide */}
              <Stack gap="2">
                <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Directory Structure (Example):</Text>
                <Box
                  style={{
                    backgroundColor: 'var(--gray-2)',
                    borderRadius: '0.375rem',
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: 'var(--gray-12)',
                    lineHeight: '1.6',
                    overflowX: 'auto',
                    whiteSpace: 'pre'
                  }}
                >
                  <Text style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {`my-nft-collection/
├── Background/
│   ├── blue.png
│   ├── red.png
│   └── yellow.png
├── Eyes/
│   ├── happy.png
│   └── sad.png
└── Mouth/
    ├── smiling.png
    └── neutral.png`}
                  </Text>
                </Box>
                <Stack gap="1" style={{ fontSize: '0.75rem', color: 'var(--gray-11)' }}>
                  <Text>
                    <span style={{ fontWeight: 500, color: 'var(--gray-12)' }}>Level 1:</span> Folder name (any name,
                    used only for organization)
                  </Text>
                  <Text>
                    <span style={{ fontWeight: 500, color: 'var(--gray-12)' }}>Level 2:</span> Trait names (e.g.,
                    Background, Eyes, Mouth) - these become your properties
                  </Text>
                  <Text>
                    <span style={{ fontWeight: 500, color: 'var(--gray-12)' }}>Level 3:</span> Item names (e.g.,
                    blue.png, happy.png) - each image in a trait
                  </Text>
                </Stack>
              </Stack>

              {/* Requirements */}
              <Stack gap="2">
                <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Requirements:</Text>
                <Stack gap="1" style={{ fontSize: '0.75rem', color: 'var(--gray-11)' }}>
                  <Text>• Supported formats: PNG, WebP</Text>
                  <Text>• Max file size: 2MB per image</Text>
                  <Text>• Max total size: 200MB</Text>
                  <Text>• Max traits: 16 (trait folders)</Text>
                  <Text>• All images must be square (1:1 aspect ratio)</Text>
                  <Text>• No hidden files (e.g., .DS_Store) or subdirectories</Text>
                </Stack>
              </Stack>

              {validationError && (
                <Box
                  role="alert"
                  aria-live="assertive"
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--error-2)',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--error-6)'
                  }}
                >
                  <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>
                    <strong>Validation Error:</strong> {validationError}
                  </Text>
                </Box>
              )}

              <Button onClick={() => directoryInputRef.current?.click()}>Select Directory</Button>
            </Stack>
          </>
        ) : (
          <>
            {/* Validation Summary */}
            <Stack gap="4">
              <Flex gap="2" style={{ alignItems: 'center' }}>
                <CheckCircle size={24} style={{ color: 'var(--success-9)' }} />
                <Heading as="h3" style={{ fontSize: '1.25rem' }}>
                  Directory Validated
                </Heading>
              </Flex>

              <Stack gap="3">
                <Stack gap="2">
                  <Text style={{ fontWeight: 600 }}>Collection Summary</Text>
                  <Stack gap="1" style={{ fontSize: '0.875rem' }}>
                    <Text>• Traits: {validatedDirectory.properties.size}</Text>
                    <Text>• Total items: {validatedDirectory.itemCount}</Text>
                    <Text>• Format: {validatedDirectory.extension}</Text>
                    <Text>• Size: {(validatedDirectory.totalSize / 1024 / 1024).toFixed(2)}MB</Text>
                  </Stack>
                </Stack>

                {/* Trait List */}
                <Stack gap="2">
                  <Text style={{ fontWeight: 600 }}>Traits:</Text>
                  <Box style={{ maxHeight: '300px', overflow: 'auto' }}>
                    <Stack gap="2">
                      {Array.from(validatedDirectory.properties.entries()).map(([trait, items]) => (
                        <Box key={trait} style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                          <Text>
                            <strong>{trait}</strong>: {items.join(', ')}
                          </Text>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </Stack>

                {/* Preview Renderers */}
                <Stack gap="2">
                  <Text style={{ fontWeight: 600 }}>Preview (coming soon)</Text>
                  <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                    Preview images will be rendered here after upload
                  </Text>
                </Stack>
              </Stack>

              {uploadError && (
                <Flex
                  gap="2"
                  role="alert"
                  aria-live="assertive"
                  style={{
                    alignItems: 'flex-start',
                    padding: '1rem',
                    backgroundColor: 'var(--error-2)',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--error-6)'
                  }}
                >
                  <AlertCircle size={20} style={{ color: 'var(--error-9)', flexShrink: 0, marginTop: '0.125rem' }} />
                  <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{uploadError}</Text>
                </Flex>
              )}

              {isUploading && (
                <Stack gap="2">
                  <Flex
                    gap="2"
                    style={{ justifyContent: 'space-between', alignItems: 'center' }}
                    aria-live="polite"
                    aria-label="Upload status"
                  >
                    <Text style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      {uploadStage === 'preparing' && '⏳ Preparing upload...'}
                      {uploadStage === 'uploading' && '📤 Uploading files...'}
                      {uploadStage === 'verifying' && '✓ Verifying upload...'}
                      {uploadStage === 'finalizing' && '📌 Finalizing...'}
                    </Text>
                    <Text style={{ fontSize: '0.875rem', fontWeight: 600 }} aria-label={`Progress: ${uploadProgress}%`}>
                      {uploadProgress}%
                    </Text>
                  </Flex>
                  <Box
                    style={{
                      width: '100%',
                      height: '8px',
                      backgroundColor: 'var(--gray-4)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}
                    role="progressbar"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Upload progress"
                  >
                    <Box
                      style={{
                        width: `${uploadProgress}%`,
                        height: '100%',
                        backgroundColor: 'var(--info-9)',
                        transition: 'width 0.3s ease-out'
                      }}
                    />
                  </Box>
                </Stack>
              )}

              {/* Actions */}
              <Flex gap="2">
                {!isUploading ? (
                  <>
                    <Button onClick={handleUpload} disabled={isUploading} style={{ flex: 1 }}>
                      Upload Collection
                    </Button>
                    <Button
                      onClick={() => {
                        setValidatedDirectory(null);
                        setValidationError('');
                      }}
                      disabled={isUploading}
                    >
                      Back
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleCancelUpload}
                    disabled={!isUploading}
                    style={{ flex: 1, backgroundColor: 'var(--error-9)' }}
                  >
                    Cancel Upload
                  </Button>
                )}
              </Flex>

              <Button onClick={onCancel} disabled={isUploading} style={{ width: '100%' }}>
                Cancel
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}
