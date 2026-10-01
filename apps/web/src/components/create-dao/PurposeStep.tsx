// components/create-dao/PurposeStep.tsx

'use client';

import { Box, Stack } from 'styled-system/jsx';

import { Card, Heading, Text, Textarea } from '@/components/ui';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function PurposeStep() {
  const purpose = useCreateDaoStore((s) => s.purpose);
  const updatePurpose = useCreateDaoStore((s) => s.updatePurpose);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);

  const handlePurposeChange = (value: string) => {
    updatePurpose({ purpose: value });
    if (!value.trim()) {
      setValidationError('purpose', 'Purpose is required');
    } else if (value.length > 500) {
      setValidationError('purpose', 'Purpose must be 500 characters or less');
    } else {
      clearValidationError('purpose');
    }
  };

  const handleMembershipModeChange = (value: string) => {
    updatePurpose({ membershipMode: value as 'founders' | 'marketplace' | 'auctions' });
    clearValidationError('membershipMode');
  };

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <Heading as="h2" style={{ fontSize: '1.25rem' }}>
            Purpose & Membership
          </Heading>

          {/* Purpose */}
          <Stack gap="2">
            <label htmlFor="purpose">
              <Text style={{ fontWeight: 600 }}>DAO Purpose *</Text>
            </label>
            <Textarea
              id="purpose"
              value={purpose.purpose}
              onChange={(e) => handlePurposeChange(e.target.value)}
              placeholder="Describe the primary purpose and goals of your DAO"
              rows={4}
              maxLength={500}
            />
            {validationErrors.purpose && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.purpose}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              What is your DAO trying to accomplish? (0-500 characters)
            </Text>
          </Stack>

          {/* Membership Mode Selection */}
          <Stack gap="3">
            <label>
              <Text style={{ fontWeight: 600 }}>Membership Model *</Text>
            </label>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Choose how tokens are allocated to members
            </Text>

            <Stack gap="3" style={{ marginTop: '0.5rem' }}>
              {/* Founders */}
              <Box
                style={{
                  padding: '1rem',
                  border: `2px ${purpose.membershipMode === 'founders' ? 'var(--blue-9)' : 'var(--gray-7)'} solid`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  backgroundColor: purpose.membershipMode === 'founders' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                }}
                onClick={() => handleMembershipModeChange('founders')}
                role="radio"
                aria-checked={purpose.membershipMode === 'founders'}
              >
                <Box style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="membershipMode"
                    value="founders"
                    checked={purpose.membershipMode === 'founders'}
                    onChange={(e) => handleMembershipModeChange(e.target.value)}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <Box>
                    <Text style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Fixed Founders</Text>
                    <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                      A predetermined set of founders receives an allocation. Best for core teams with clear ownership.
                    </Text>
                  </Box>
                </Box>
              </Box>

              {/* Marketplace */}
              <Box
                style={{
                  padding: '1rem',
                  border: `2px ${purpose.membershipMode === 'marketplace' ? 'var(--blue-9)' : 'var(--gray-7)'} solid`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  backgroundColor: purpose.membershipMode === 'marketplace' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                }}
                onClick={() => handleMembershipModeChange('marketplace')}
                role="radio"
                aria-checked={purpose.membershipMode === 'marketplace'}
              >
                <Box style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="membershipMode"
                    value="marketplace"
                    checked={purpose.membershipMode === 'marketplace'}
                    onChange={(e) => handleMembershipModeChange(e.target.value)}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <Box>
                    <Text style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Marketplace</Text>
                    <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                      Members can buy and sell tokens on a marketplace. Best for DAOs with open membership and regular
                      trading.
                    </Text>
                  </Box>
                </Box>
              </Box>

              {/* Auctions */}
              <Box
                style={{
                  padding: '1rem',
                  border: `2px ${purpose.membershipMode === 'auctions' ? 'var(--blue-9)' : 'var(--gray-7)'} solid`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  backgroundColor: purpose.membershipMode === 'auctions' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                }}
                onClick={() => handleMembershipModeChange('auctions')}
                role="radio"
                aria-checked={purpose.membershipMode === 'auctions'}
              >
                <Box style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="membershipMode"
                    value="auctions"
                    checked={purpose.membershipMode === 'auctions'}
                    onChange={(e) => handleMembershipModeChange(e.target.value)}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <Box>
                    <Text style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Auctions</Text>
                    <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                      Members acquire tokens through periodic auctions. Best for DAOs with continuous membership
                      acquisition.
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Stack>

            {validationErrors.membershipMode && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.membershipMode}</Text>
            )}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
