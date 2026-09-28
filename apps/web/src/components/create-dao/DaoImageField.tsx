'use client';

import { AlertCircle, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Badge, Button, Card, Heading, Input, Text } from '@/components/ui';
import { GeneratedImageCandidate } from '@/lib/ai-image-generation';
import { UPLOAD_POLICIES, validateFileSize, validateImageDimensions, validateMimeType } from '@/lib/pinata-upload';
import { DEFAULT_DAO_IMAGE_URL, LOCAL_DEFAULT_DAO_IMAGE_URL, useCreateDaoStore } from '@/stores/create-dao-store';

const DEFAULT_IMAGE_URL = DEFAULT_DAO_IMAGE_URL;

export function DaoImageField() {
  const basicInfo = useCreateDaoStore((s) => s.basicInfo);
  const daoImageSource = useCreateDaoStore((s) => s.daoImageSource);
  const setDaoImageSource = useCreateDaoStore((s) => s.setDaoImageSource);
  const updateBasicInfo = useCreateDaoStore((s) => s.updateBasicInfo);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);

  // Local state for generation modal
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [stylePreset, setStylePreset] = useState<'modern' | 'vintage' | 'abstract' | 'minimal' | 'vibrant'>('modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const [candidates, setCandidates] = useState<GeneratedImageCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<GeneratedImageCandidate | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [generationError, setGenerationError] = useState<string>('');

  // Local state for manual upload
  const [uploadError, setUploadError] = useState<string | undefined>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Race condition guards: prevent stale uploads from overwriting newer ones
  const uploadRunIdRef = useRef<string>('');

  /**
   * Upload blob to Pinata with XHR progress tracking
   */
  const uploadBlobToSignedUrl = useCallback((blob: Blob, signedUrl: string, runId: string): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (uploadRunIdRef.current !== runId) {
          // Upload was superseded
          xhr.abort();
          reject(new Error('Upload cancelled'));
          return;
        }

        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (uploadRunIdRef.current !== runId) {
          reject(new Error('Upload cancelled'));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          // Convert XHR response to fetch Response
          resolve(
            new Response(xhr.response, {
              status: xhr.status,
              statusText: xhr.statusText,
              headers: new Headers()
            })
          );
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        if (uploadRunIdRef.current === runId) {
          reject(
            new Error('Network connection lost during upload. Please check your internet connection and try again.')
          );
        }
      });

      xhr.addEventListener('abort', () => {
        if (uploadRunIdRef.current === runId) {
          reject(new Error('Upload was cancelled'));
        }
      });

      // Send upload
      const formData = new FormData();
      formData.append('file', blob);
      xhr.open('POST', signedUrl);
      xhr.send(formData);
    });
  }, []);

  // Get the current display image
  const displayImage =
    daoImageSource?.kind === 'generated' || daoImageSource?.kind === 'uploaded'
      ? daoImageSource.gatewayUrl
      : daoImageSource?.kind === 'default'
        ? LOCAL_DEFAULT_DAO_IMAGE_URL
        : basicInfo.contractImage === DEFAULT_IMAGE_URL
          ? LOCAL_DEFAULT_DAO_IMAGE_URL
          : basicInfo.contractImage || LOCAL_DEFAULT_DAO_IMAGE_URL;

  // Get source badge
  const getSourceBadge = () => {
    if (!daoImageSource || daoImageSource.kind === 'legacy-unconfirmed') {
      return <Badge style={{ backgroundColor: 'var(--warning-9)', color: 'white' }}>Not Selected</Badge>;
    }
    if (daoImageSource.kind === 'generated') {
      return <Badge style={{ backgroundColor: 'var(--info-9)', color: 'white' }}>Generated</Badge>;
    }
    if (daoImageSource.kind === 'uploaded') {
      return <Badge style={{ backgroundColor: 'var(--info-9)', color: 'white' }}>Uploaded</Badge>;
    }
    if (daoImageSource.kind === 'default') {
      return <Badge style={{ backgroundColor: 'var(--gray-9)', color: 'white' }}>Default</Badge>;
    }
  };

  // Generate image candidates
  const handleGenerate = async () => {
    if (!basicInfo.tokenName.trim() || !basicInfo.description.trim()) {
      setGenerationError('Please fill in DAO name and description first');
      return;
    }

    setIsGenerating(true);
    setGenerationError('');

    try {
      const response = await fetch('/api/artwork/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'required' // TODO: Generate proper CSRF token
        },
        body: JSON.stringify({
          name: basicInfo.tokenName,
          description: basicInfo.description,
          artDirection: generationPrompt,
          stylePreset
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('Too many generation requests. Please wait a moment and try again.');
        } else if (response.status === 404) {
          throw new Error('Image generation is not enabled. Please contact the administrator.');
        }
        throw new Error(errorData.error || 'Failed to generate images. Please try again.');
      }

      const data = await response.json();
      setCandidates(data.candidates);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Image generation failed. Please try again.';
      setGenerationError(errorMessage);
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Upload selected candidate to Pinata with race condition guard
  const uploadCandidate = useCallback(
    async (candidate: GeneratedImageCandidate) => {
      // Generate unique run ID for this upload
      const runId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      uploadRunIdRef.current = runId;

      setIsUploading(true);
      setUploadProgress(0);
      setGenerationError('');

      try {
        // Get signed URL from backend
        const urlResponse = await fetch('/api/uploads/pinata-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': 'required' // TODO: Generate proper CSRF token
          },
          body: JSON.stringify({
            uploadType: 'dao-image',
            mimeType: 'image/png',
            sizeBytes: 5 * 1024 * 1024, // Estimate
            filename: `dao-image-${Date.now()}.png`
          })
        });

        if (!urlResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const authData = await urlResponse.json();
        const { signedUrl, uploadId } = authData;

        // Check if operation was superseded
        if (uploadRunIdRef.current !== runId) {
          return;
        }

        // Download the image from temporary URL and upload to Pinata
        const imageResponse = await fetch(candidate.temporaryUrl);
        if (!imageResponse.ok) {
          throw new Error('Failed to fetch candidate image');
        }

        const imageBlob = await imageResponse.blob();

        // Check if operation was superseded
        if (uploadRunIdRef.current !== runId) {
          return;
        }

        // Upload directly to signed URL with progress tracking
        const pinataResponse = await uploadBlobToSignedUrl(imageBlob, signedUrl, runId);

        if (!pinataResponse.ok) {
          throw new Error('Failed to upload image to Pinata. Please try again.');
        }

        // Check if operation was superseded
        if (uploadRunIdRef.current !== runId) {
          return;
        }

        // Extract CID from Pinata response
        const uploadedData = await pinataResponse.json();
        const cid = uploadedData.data?.cid || uploadedData.cid;
        if (!cid) {
          throw new Error('Image upload succeeded but CID was not returned. Please try again.');
        }

        // Complete the upload
        const completeResponse = await fetch('/api/uploads/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            uploadId,
            cid,
            filename: `dao-image-${Date.now()}.png`,
            mimeType: 'image/png',
            sizeBytes: imageBlob.size,
            uploadType: 'dao-image'
          })
        });

        if (!completeResponse.ok) {
          const errorData = await completeResponse.json().catch(() => ({}));
          const errorCode = errorData.code;
          if (errorCode === 'CID_NOT_FOUND') {
            throw new Error('Upload verification failed. The image may not have uploaded correctly. Please try again.');
          }
          throw new Error('Failed to finalize image upload. Please try again.');
        }

        const result = await completeResponse.json();

        // Final check before updating store
        if (uploadRunIdRef.current === runId) {
          // Update store with generated source
          setDaoImageSource({
            kind: 'generated',
            gatewayUrl: result.gatewayUrl,
            ipfsUri: result.ipfsUri,
            prompt: basicInfo.description,
            model: candidate.model
          });

          updateBasicInfo({ contractImage: result.gatewayUrl });
          setGenerationOpen(false);
          setCandidates([]);
          setSelectedCandidate(null);
          clearValidationError('daoImage');
        }
      } catch (error) {
        // Only update error state if this is still the active upload
        if (uploadRunIdRef.current === runId) {
          const errorMessage = error instanceof Error ? error.message : 'Image upload failed. Please try again.';
          setGenerationError(errorMessage);
          console.error('Upload error:', error);
        }
      } finally {
        if (uploadRunIdRef.current === runId) {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    },
    [basicInfo.description, clearValidationError, updateBasicInfo, setDaoImageSource, uploadBlobToSignedUrl]
  );

  // Handle manual file upload with race condition guard
  const handleFileSelect = useCallback(
    async (file: File) => {
      // Generate unique run ID for this upload
      const runId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      uploadRunIdRef.current = runId;

      setUploadError('');
      setUploadProgress(0);

      // Validate MIME type
      const mimeValidation = validateMimeType(file.type, 'dao-image');
      if (!mimeValidation.valid) {
        setUploadError(mimeValidation.error);
        return;
      }

      // Validate file size
      const sizeValidation = validateFileSize(file.size, 'dao-image');
      if (!sizeValidation.valid) {
        setUploadError(sizeValidation.error);
        return;
      }

      // Validate image dimensions
      const img = new Image();
      img.onload = async () => {
        // Check if operation was superseded
        if (uploadRunIdRef.current !== runId) {
          return;
        }

        const policy = UPLOAD_POLICIES['dao-image'];
        const dimensionValidation = validateImageDimensions(img.width, img.height, policy);
        if (!dimensionValidation.valid) {
          if (uploadRunIdRef.current === runId) {
            setUploadError(dimensionValidation.error);
          }
          return;
        }

        // Proceed with upload
        setIsUploading(true);
        try {
          // Get signed URL
          const urlResponse = await fetch('/api/uploads/pinata-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': 'required' // TODO: Generate proper CSRF token
            },
            body: JSON.stringify({
              uploadType: 'dao-image',
              mimeType: file.type,
              sizeBytes: file.size,
              filename: file.name
            })
          });

          if (!urlResponse.ok) {
            throw new Error('Failed to get upload URL');
          }

          const authData = await urlResponse.json();
          const { signedUrl, uploadId } = authData;

          // Check if operation was superseded
          if (uploadRunIdRef.current !== runId) {
            return;
          }

          // Upload to signed URL with progress tracking
          const pinataResponse = await uploadBlobToSignedUrl(file, signedUrl, runId);

          if (!pinataResponse.ok) {
            throw new Error('Failed to upload image to Pinata. Please check your internet connection and try again.');
          }

          // Check if operation was superseded
          if (uploadRunIdRef.current !== runId) {
            return;
          }

          // Extract CID from Pinata response
          const uploadedData = await pinataResponse.json();
          const cid = uploadedData.data?.cid || uploadedData.cid;
          if (!cid) {
            throw new Error('Image upload succeeded but CID was not returned. Please try again.');
          }

          // Complete the upload
          const completeResponse = await fetch('/api/uploads/complete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              uploadId,
              cid,
              filename: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              uploadType: 'dao-image'
            })
          });

          if (!completeResponse.ok) {
            const errorData = await completeResponse.json().catch(() => ({}));
            const errorCode = errorData.code;
            if (errorCode === 'CID_NOT_FOUND') {
              throw new Error(
                'Upload verification failed. The image may not have uploaded correctly. Please try again.'
              );
            } else if (errorCode === 'AUTHORIZATION_EXPIRED') {
              throw new Error('Your upload session expired. Please try uploading again.');
            }
            throw new Error('Failed to finalize image upload. Please try again.');
          }

          const result = await completeResponse.json();

          // Final check before updating store
          if (uploadRunIdRef.current === runId) {
            // Update store with uploaded source
            setDaoImageSource({
              kind: 'uploaded',
              gatewayUrl: result.gatewayUrl,
              ipfsUri: result.ipfsUri,
              filename: file.name
            });

            updateBasicInfo({ contractImage: result.gatewayUrl });
            clearValidationError('daoImage');
          }
        } catch (error) {
          // Only update error state if this is still the active upload
          if (uploadRunIdRef.current === runId) {
            const errorMessage = error instanceof Error ? error.message : 'Image upload failed. Please try again.';
            setUploadError(errorMessage);
            console.error('Upload error:', error);
          }
        } finally {
          if (uploadRunIdRef.current === runId) {
            setIsUploading(false);
            setUploadProgress(0);
          }
        }
      };
      img.onerror = () => {
        if (uploadRunIdRef.current === runId) {
          setUploadError('Unable to read image dimensions. Make sure the file is a valid image.');
        }
      };
      img.src = URL.createObjectURL(file);
    },
    [clearValidationError, updateBasicInfo, setDaoImageSource, uploadBlobToSignedUrl]
  );

  const handleUseDefault = () => {
    setDaoImageSource({ kind: 'default', gatewayUrl: DEFAULT_IMAGE_URL });
    updateBasicInfo({ contractImage: DEFAULT_IMAGE_URL });
    clearValidationError('daoImage');
  };

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <Heading as="h3" style={{ fontSize: '1rem' }}>
            DAO Identity Image
          </Heading>

          {/* Image Preview */}
          <Box
            style={{
              borderRadius: '0.5rem',
              overflow: 'hidden',
              backgroundColor: 'var(--gray-2)',
              aspectRatio: '1',
              maxWidth: '200px'
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImage}
              alt="DAO Identity"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(event) => {
                if (!event.currentTarget.src.endsWith(LOCAL_DEFAULT_DAO_IMAGE_URL)) {
                  event.currentTarget.src = LOCAL_DEFAULT_DAO_IMAGE_URL;
                }
              }}
            />
          </Box>

          {/* Source Badge */}
          {getSourceBadge()}

          {/* Action Buttons */}
          <Flex gap="2" style={{ flexWrap: 'wrap' }}>
            {process.env.NEXT_PUBLIC_IMAGE_GENERATION_ENABLED === 'true' &&
              process.env.NEXT_PUBLIC_PINATA_UPLOADS_ENABLED === 'true' && (
                <Button
                  onClick={() => setGenerationOpen(true)}
                  disabled={isGenerating || isUploading}
                  style={{ cursor: 'pointer' }}
                >
                  Generate Image
                </Button>
              )}

            {process.env.NEXT_PUBLIC_PINATA_UPLOADS_ENABLED === 'true' && (
              <>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isGenerating}
                  style={{ cursor: 'pointer' }}
                >
                  <Upload size={16} style={{ marginRight: '0.5rem' }} />
                  Upload Image
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  style={{ display: 'none' }}
                />
              </>
            )}

            <Button onClick={handleUseDefault} disabled={isUploading || isGenerating}>
              Use Builder Default
            </Button>
          </Flex>

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

          {validationErrors.daoImage && (
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
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.daoImage}</Text>
            </Flex>
          )}

          {isUploading && uploadProgress > 0 && (
            <Stack gap="2">
              <Flex
                gap="2"
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
                aria-live="polite"
                aria-label="Upload status"
              >
                <Text style={{ fontSize: '0.875rem' }}>Uploading</Text>
                <Text style={{ fontSize: '0.875rem', fontWeight: 600 }} aria-label={`Progress: ${uploadProgress}%`}>
                  {uploadProgress}%
                </Text>
              </Flex>
              <Box
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: 'var(--gray-4)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}
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

          {/* Generation Modal */}
          {generationOpen && (
            <Card p="4" style={{ border: '1px solid var(--gray-6)' }}>
              <Stack gap="4">
                <Heading as="h4" style={{ fontSize: '0.9rem' }}>
                  Generate DAO Image
                </Heading>

                <Stack gap="2">
                  <label htmlFor="artDirection">
                    <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Art Direction (Optional)</Text>
                  </label>
                  <Input
                    id="artDirection"
                    value={generationPrompt}
                    onChange={(e) => setGenerationPrompt(e.target.value)}
                    placeholder="e.g., futuristic tech theme, nature elements, minimalist design"
                    disabled={isGenerating}
                  />
                  <Text style={{ color: 'var(--gray-11)', fontSize: '0.75rem' }}>
                    Describe additional visual elements or style preferences
                  </Text>
                </Stack>

                <Stack gap="2">
                  <label htmlFor="stylePreset">
                    <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Style Preset</Text>
                  </label>
                  <select
                    id="stylePreset"
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value as any)}
                    disabled={isGenerating}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'white',
                      color: 'var(--gray-12)'
                    }}
                  >
                    <option value="modern">Modern</option>
                    <option value="vintage">Vintage</option>
                    <option value="abstract">Abstract</option>
                    <option value="minimal">Minimal</option>
                    <option value="vibrant">Vibrant</option>
                  </select>
                </Stack>

                {candidates.length > 0 && (
                  <Stack gap="2">
                    <Text style={{ fontWeight: 600, fontSize: '0.875rem' }}>Select a Candidate</Text>
                    <Flex gap="2" style={{ flexWrap: 'wrap' }}>
                      {candidates.map((c) => (
                        <Box
                          key={c.id}
                          onClick={() => setSelectedCandidate(c)}
                          style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '0.375rem',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border:
                              selectedCandidate?.id === c.id ? '3px solid var(--info-9)' : '1px solid var(--gray-6)'
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.temporaryUrl}
                            alt="Candidate"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </Box>
                      ))}
                    </Flex>
                  </Stack>
                )}

                {generationError && (
                  <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{generationError}</Text>
                )}

                <Flex gap="2">
                  {candidates.length === 0 && !isGenerating && (
                    <Button onClick={handleGenerate} disabled={isGenerating}>
                      Generate Candidates
                    </Button>
                  )}
                  {candidates.length > 0 && (
                    <>
                      <Button
                        onClick={() => uploadCandidate(selectedCandidate!)}
                        disabled={!selectedCandidate || isUploading}
                      >
                        {isUploading ? 'Uploading...' : 'Use Selected'}
                      </Button>
                      <Button
                        onClick={() => {
                          setCandidates([]);
                          setSelectedCandidate(null);
                          setGenerationPrompt('');
                          setGenerationError('');
                        }}
                        disabled={isUploading}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </Flex>
              </Stack>
            </Card>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
