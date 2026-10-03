// components/create-dao/BasicInfoStep.tsx

'use client';

import { Upload } from 'lucide-react';
import Image from 'next/image';
import { useRef } from 'react';
import { Box, Flex, Stack } from 'styled-system/jsx';

import { Card, Heading, Input, Text, Textarea } from '@/components/ui';
import { isValidTokenSymbol, MAX_TOKEN_SYMBOL_LENGTH } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function BasicInfoStep() {
  const basicInfo = useCreateDaoStore((s) => s.basicInfo);
  const updateBasicInfo = useCreateDaoStore((s) => s.updateBasicInfo);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTokenNameChange = (value: string) => {
    updateBasicInfo({ tokenName: value });
    if (!value.trim()) {
      setValidationError('tokenName', 'DAO name is required');
    } else if (value.length > 80) {
      setValidationError('tokenName', 'DAO name must be 80 characters or less');
    } else {
      clearValidationError('tokenName');
    }
  };

  const handleTokenSymbolChange = (value: string) => {
    const upper = value.toUpperCase();
    updateBasicInfo({ tokenSymbol: upper });
    if (!upper.trim()) {
      setValidationError('tokenSymbol', 'Token symbol is required');
    } else if (!isValidTokenSymbol(upper)) {
      setValidationError(
        'tokenSymbol',
        `Token symbol must be uppercase alphanumeric, max ${MAX_TOKEN_SYMBOL_LENGTH} characters`
      );
    } else {
      clearValidationError('tokenSymbol');
    }
  };

  const handleDescriptionChange = (value: string) => {
    updateBasicInfo({ description: value });
    if (!value.trim()) {
      setValidationError('description', 'Description is required');
    } else if (value.length < 12) {
      setValidationError('description', 'Description must be at least 12 characters');
    } else if (value.length > 240) {
      setValidationError('description', 'Description must be 240 characters or less');
    } else {
      clearValidationError('description');
    }
  };

  const handleImageFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setValidationError('daoImage', 'Please select a valid image file (PNG, JPG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setValidationError('daoImage', 'Image must be smaller than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      updateBasicInfo({ contractImage: dataUrl });
      clearValidationError('daoImage');
    };
    reader.onerror = () => {
      setValidationError('daoImage', 'Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <Heading as="h2" style={{ fontSize: '1.25rem' }}>
            DAO Identity
          </Heading>

          {/* Simple Image Upload */}
          <Stack gap="2">
            <label>
              <Text style={{ fontWeight: 600 }}>DAO Image *</Text>
            </label>
            <Box
              style={{
                borderRadius: '0.5rem',
                overflow: 'hidden',
                backgroundColor: 'var(--gray-2)',
                aspectRatio: '1',
                maxWidth: '200px'
              }}
            >
              {basicInfo.contractImage ? (
                <Image
                  src={basicInfo.contractImage}
                  alt="DAO"
                  width={200}
                  height={200}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: 'var(--gray-9)'
                  }}
                >
                  <Upload size={24} />
                </Box>
              )}
            </Box>
            <Flex gap="2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--blue-9)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Upload Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => e.target.files?.[0] && handleImageFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
            </Flex>
            {validationErrors.daoImage && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.daoImage}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Simple image upload (PNG, JPG, WebP, max 5MB). Recommended: 500x500px
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="tokenName">
              <Text style={{ fontWeight: 600 }}>DAO Name *</Text>
            </label>
            <Input
              id="tokenName"
              value={basicInfo.tokenName}
              onChange={(e) => handleTokenNameChange(e.target.value)}
              placeholder="e.g., Builder DAO"
              maxLength={80}
            />
            {validationErrors.tokenName && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.tokenName}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              The name of your DAO (2-80 characters)
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="tokenSymbol">
              <Text style={{ fontWeight: 600 }}>Token Symbol *</Text>
            </label>
            <Input
              id="tokenSymbol"
              value={basicInfo.tokenSymbol}
              onChange={(e) => handleTokenSymbolChange(e.target.value)}
              placeholder="e.g., BUILD"
              maxLength={MAX_TOKEN_SYMBOL_LENGTH}
            />
            {validationErrors.tokenSymbol && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.tokenSymbol}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Short identifier (2-{MAX_TOKEN_SYMBOL_LENGTH} characters, uppercase)
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="description">
              <Text style={{ fontWeight: 600 }}>Description *</Text>
            </label>
            <Textarea
              id="description"
              value={basicInfo.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Describe what your DAO does and its purpose"
              rows={4}
              maxLength={240}
            />
            {validationErrors.description && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.description}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              A brief description (12-240 characters)
            </Text>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
