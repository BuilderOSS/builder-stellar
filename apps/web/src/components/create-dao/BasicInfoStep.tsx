// components/create-dao/BasicInfoStep.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Card, Heading, Input, Text, Textarea } from '@/components/ui';
import { isValidHttpUrl, isValidTokenSymbol, isValidUrl } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function BasicInfoStep() {
  const basicInfo = useCreateDaoStore((s) => s.basicInfo);
  const updateBasicInfo = useCreateDaoStore((s) => s.updateBasicInfo);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);

  const handleTokenNameChange = (value: string) => {
    updateBasicInfo({ tokenName: value });
    if (!value.trim()) {
      setValidationError('tokenName', 'Token name is required');
    } else if (value.length > 100) {
      setValidationError('tokenName', 'Token name must be 100 characters or less');
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
      setValidationError('tokenSymbol', 'Token symbol must be uppercase alphanumeric, max 12 characters');
    } else {
      clearValidationError('tokenSymbol');
    }
  };

  const handleDescriptionChange = (value: string) => {
    updateBasicInfo({ description: value });
    if (!value.trim()) {
      setValidationError('description', 'Description is required');
    } else if (value.length > 500) {
      setValidationError('description', 'Description must be 500 characters or less');
    } else {
      clearValidationError('description');
    }
  };

  const handleProjectUriChange = (value: string) => {
    updateBasicInfo({ projectUri: value });
    if (value && !isValidHttpUrl(value)) {
      setValidationError('projectUri', 'Project URI must be a valid HTTP/HTTPS URL');
    } else {
      clearValidationError('projectUri');
    }
  };

  const handleTokenUriChange = (value: string) => {
    updateBasicInfo({ tokenUri: value });
    if (value && !isValidUrl(value)) {
      setValidationError('tokenUri', 'Token URI must be a valid HTTP/HTTPS or IPFS URL');
    } else {
      clearValidationError('tokenUri');
    }
  };

  const handleContractImageChange = (value: string) => {
    updateBasicInfo({ contractImage: value });
    if (value && !isValidUrl(value)) {
      setValidationError('contractImage', 'Contract image must be a valid HTTP/HTTPS or IPFS URL');
    } else {
      clearValidationError('contractImage');
    }
  };

  const handleRendererBaseChange = (value: string) => {
    updateBasicInfo({ rendererBase: value });
    if (value && !isValidHttpUrl(value)) {
      setValidationError('rendererBase', 'Renderer base must be a valid HTTP/HTTPS URL');
    } else {
      clearValidationError('rendererBase');
    }
  };

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <Heading as="h2" style={{ fontSize: '1.25rem' }}>
            Basic Information
          </Heading>

          <Stack gap="2">
            <label htmlFor="tokenName">
              <Text style={{ fontWeight: 600 }}>Token Name *</Text>
            </label>
            <Input
              id="tokenName"
              value={basicInfo.tokenName}
              onChange={(e) => handleTokenNameChange(e.target.value)}
              placeholder="e.g., Builder DAO"
            />
            {validationErrors.tokenName && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.tokenName}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              The full name of your DAO&apos;s governance token
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
              maxLength={12}
            />
            {validationErrors.tokenSymbol && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.tokenSymbol}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>Short identifier (max 10 characters)</Text>
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
            />
            {validationErrors.description && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.description}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              A brief description of your DAO&apos;s mission and purpose
            </Text>
          </Stack>
        </Stack>
      </Card>

      <Card p="5">
        <Stack gap="4">
          <Heading as="h2" style={{ fontSize: '1.25rem' }}>
            URLs & Metadata
          </Heading>

          <Stack gap="2">
            <label htmlFor="projectUri">
              <Text style={{ fontWeight: 600 }}>Project Website</Text>
            </label>
            <Input
              id="projectUri"
              value={basicInfo.projectUri}
              onChange={(e) => handleProjectUriChange(e.target.value)}
              placeholder="https://example.com"
              type="url"
            />
            {validationErrors.projectUri && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.projectUri}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Your DAO&apos;s main website or documentation
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="tokenUri">
              <Text style={{ fontWeight: 600 }}>Token Metadata URI</Text>
            </label>
            <Input
              id="tokenUri"
              value={basicInfo.tokenUri}
              onChange={(e) => handleTokenUriChange(e.target.value)}
              placeholder="https://example.com/api/dao/{daoId}/token/"
              type="url"
            />
            {validationErrors.tokenUri && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.tokenUri}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              API endpoint for token metadata. Use {'{daoId}'} as a placeholder.
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="contractImage">
              <Text style={{ fontWeight: 600 }}>DAO Logo Image</Text>
            </label>
            <Input
              id="contractImage"
              value={basicInfo.contractImage}
              onChange={(e) => handleContractImageChange(e.target.value)}
              placeholder="https://example.com/logo.png"
              type="url"
            />
            {validationErrors.contractImage && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.contractImage}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>URL to your DAO&apos;s logo image</Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="rendererBase">
              <Text style={{ fontWeight: 600 }}>Renderer Base URL</Text>
            </label>
            <Input
              id="rendererBase"
              value={basicInfo.rendererBase}
              onChange={(e) => handleRendererBaseChange(e.target.value)}
              placeholder="https://example.com/api/render/"
              type="url"
            />
            {validationErrors.rendererBase && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.rendererBase}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Base URL for NFT rendering service (optional)
            </Text>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
