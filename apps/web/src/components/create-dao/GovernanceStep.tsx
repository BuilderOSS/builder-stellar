// components/create-dao/GovernanceStep.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Card, Heading, Input, Text } from '@/components/ui';
import { validateDuration } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

export function GovernanceStep() {
  const governance = useCreateDaoStore((s) => s.governance);
  const updateGovernance = useCreateDaoStore((s) => s.updateGovernance);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);

  const handleVotingDelayChange = (value: string) => {
    const seconds = Number(value);
    if (!isNaN(seconds) && seconds >= 0) {
      updateGovernance({ votingDelay: seconds });
      const error = validateDuration(seconds, 300); // Min 5 minutes
      if (error) {
        setValidationError('votingDelay', error);
      } else {
        clearValidationError('votingDelay');
      }
    }
  };

  const handleVotingPeriodChange = (value: string) => {
    const seconds = Number(value);
    if (!isNaN(seconds) && seconds >= 0) {
      updateGovernance({ votingPeriod: seconds });
      const error = validateDuration(seconds, 3600); // Min 1 hour
      if (error) {
        setValidationError('votingPeriod', error);
      } else {
        clearValidationError('votingPeriod');
      }
    }
  };

  const handleQuorumBpsChange = (value: string) => {
    const bps = Number(value);
    if (!isNaN(bps)) {
      updateGovernance({ quorumBps: bps });
      if (bps < 0 || bps > 10000) {
        setValidationError('quorumBps', 'Quorum must be between 0 and 10000 basis points');
      } else {
        clearValidationError('quorumBps');
      }
    }
  };

  const handleProposalThresholdBpsChange = (value: string) => {
    const bps = Number(value);
    if (!isNaN(bps)) {
      updateGovernance({ proposalThresholdBps: bps });
      if (bps < 0 || bps > 10000) {
        setValidationError('proposalThresholdBps', 'Proposal threshold must be between 0 and 10000 basis points');
      } else {
        clearValidationError('proposalThresholdBps');
      }
    }
  };

  // Helper to convert basis points to percentage
  const bpsToPercent = (bps: number) => (bps / 100).toFixed(2);

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <div>
            <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              Governance Parameters
            </Heading>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Configure voting rules and proposal thresholds for your DAO
            </Text>
          </div>

          <Stack gap="2">
            <label htmlFor="votingDelay">
              <Text style={{ fontWeight: 600 }}>Voting Delay (seconds)</Text>
            </label>
            <Input
              id="votingDelay"
              type="number"
              value={governance.votingDelay}
              onChange={(e) => handleVotingDelayChange(e.target.value)}
              placeholder="86400"
              min="0"
            />
            {validationErrors.votingDelay && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.votingDelay}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Time between proposal creation and voting start. 86400 seconds = 24 hours
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="votingPeriod">
              <Text style={{ fontWeight: 600 }}>Voting Period (seconds)</Text>
            </label>
            <Input
              id="votingPeriod"
              type="number"
              value={governance.votingPeriod}
              onChange={(e) => handleVotingPeriodChange(e.target.value)}
              placeholder="259200"
              min="0"
            />
            {validationErrors.votingPeriod && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.votingPeriod}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              How long voting is open. 259200 seconds = 3 days
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="quorumBps">
              <Text style={{ fontWeight: 600 }}>Quorum (basis points)</Text>
            </label>
            <Input
              id="quorumBps"
              type="number"
              value={governance.quorumBps}
              onChange={(e) => handleQuorumBpsChange(e.target.value)}
              placeholder="1000"
              min="0"
              max="10000"
            />
            {validationErrors.quorumBps && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.quorumBps}</Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Minimum % of votes needed for proposal to pass. 1000 basis points = {bpsToPercent(governance.quorumBps)}%
              of total supply. Range: 0-10000
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="proposalThresholdBps">
              <Text style={{ fontWeight: 600 }}>Proposal Threshold (basis points)</Text>
            </label>
            <Input
              id="proposalThresholdBps"
              type="number"
              value={governance.proposalThresholdBps}
              onChange={(e) => handleProposalThresholdBpsChange(e.target.value)}
              placeholder="100"
              min="0"
              max="10000"
            />
            {validationErrors.proposalThresholdBps && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>
                {validationErrors.proposalThresholdBps}
              </Text>
            )}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Minimum % of votes required to create a proposal. 100 basis points ={' '}
              {bpsToPercent(governance.proposalThresholdBps)}% of total supply. Range: 0-10000
            </Text>
          </Stack>
        </Stack>
      </Card>

      <Card p="5" style={{ background: 'var(--accent-2)', border: '1px solid var(--accent-6)' }}>
        <Stack gap="2">
          <Heading as="h3" style={{ fontSize: '1rem', color: 'var(--accent-11)' }}>
            Understanding Basis Points
          </Heading>
          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-12)' }}>1 basis point = 0.01%. Common values:</Text>
          <ul style={{ marginLeft: '1.5rem', fontSize: '0.875rem', color: 'var(--gray-12)' }}>
            <li>100 bps = 1%</li>
            <li>500 bps = 5%</li>
            <li>1000 bps = 10%</li>
            <li>2000 bps = 20%</li>
            <li>5000 bps = 50%</li>
          </ul>
        </Stack>
      </Card>
    </Stack>
  );
}
