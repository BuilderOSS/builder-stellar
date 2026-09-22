// components/create-dao/BasicInfoStep.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Card, Heading, Input, Text, Textarea } from '@/components/ui';
import { isValidTokenSymbol } from '@/lib/validation';
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
    </Stack>
  );
}
