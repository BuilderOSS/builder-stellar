// components/create-dao/GovernanceStep.tsx

'use client';

import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { DurationInput } from '@/components/admin/duration-input';
import { Button, Card, Heading, Input, Text } from '@/components/ui';
import { splitDuration } from '@/lib/duration';
import { validateDuration } from '@/lib/validation';
import { useCreateDaoStore } from '@/stores/create-dao-store';

const MIN_VOTING_PERIOD = 60 * 60;
const MAX_VOTING_PERIOD = 30 * 86400;
const IS_TESTNET = (process.env.NEXT_PUBLIC_NETWORK || process.env.NETWORK_PUBLIC_NETWORK || 'testnet') === 'testnet';

const STANDARD_GOVERNANCE_PRESETS = [
  {
    id: 'fast',
    title: 'Fast-moving',
    description: 'For frequent decisions and active collaboration.',
    votingDelay: 5 * 60,
    votingPeriod: 60 * 60,
    quorumBps: 500,
    proposalThresholdBps: 50
  },
  {
    id: 'balanced',
    title: 'Balanced',
    description: 'A practical starting point for most DAOs. Not sure where to start? Choose this.',
    votingDelay: 86400,
    votingPeriod: 3 * 86400,
    quorumBps: 1000,
    proposalThresholdBps: 100
  },
  {
    id: 'deliberate',
    title: 'Deliberate',
    description: 'For decisions that need more time to review.',
    votingDelay: 2 * 86400,
    votingPeriod: 7 * 86400,
    quorumBps: 2000,
    proposalThresholdBps: 200
  }
] as const;

const TESTING_GOVERNANCE_PRESET = {
  id: 'testing',
  title: 'Testing / super-fast',
  description: 'For testing DAO flows on testnet with the shortest valid timings.',
  votingDelay: 5 * 60,
  votingPeriod: 60 * 60,
  quorumBps: 0,
  proposalThresholdBps: 0
} as const;

const GOVERNANCE_PRESETS = IS_TESTNET
  ? ([TESTING_GOVERNANCE_PRESET, ...STANDARD_GOVERNANCE_PRESETS] as const)
  : STANDARD_GOVERNANCE_PRESETS;

function formatDuration(totalSeconds: number) {
  const parts = splitDuration(totalSeconds);
  const values = [
    parts.days ? `${parts.days} day${parts.days === 1 ? '' : 's'}` : '',
    parts.hours ? `${parts.hours} hour${parts.hours === 1 ? '' : 's'}` : '',
    parts.minutes ? `${parts.minutes} minute${parts.minutes === 1 ? '' : 's'}` : '',
    parts.seconds ? `${parts.seconds} second${parts.seconds === 1 ? '' : 's'}` : ''
  ].filter(Boolean);

  return values.length > 0 ? values.join(', ') : '0 seconds';
}

export function GovernanceStep() {
  const governance = useCreateDaoStore((state) => state.governance);
  const updateGovernance = useCreateDaoStore((state) => state.updateGovernance);
  const validationErrors = useCreateDaoStore((state) => state.validationErrors);
  const setValidationError = useCreateDaoStore((state) => state.setValidationError);
  const clearValidationError = useCreateDaoStore((state) => state.clearValidationError);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const matchingPreset = GOVERNANCE_PRESETS.find(
    (preset) =>
      preset.votingDelay === governance.votingDelay &&
      preset.votingPeriod === governance.votingPeriod &&
      preset.quorumBps === governance.quorumBps &&
      preset.proposalThresholdBps === governance.proposalThresholdBps
  )?.id;
  const activePreset = matchingPreset ?? 'custom';
  const advancedVisible = showAdvanced || activePreset === 'custom';

  const updateDuration = (field: 'votingDelay' | 'votingPeriod', seconds: number) => {
    updateGovernance({ [field]: seconds });
    const minimum = field === 'votingDelay' ? 300 : 3600;
    const error = validateDuration(seconds, minimum);
    setShowAdvanced(true);
    if (error) setValidationError(field, error);
    else clearValidationError(field);
  };

  const applyPreset = (preset: (typeof GOVERNANCE_PRESETS)[number]) => {
    updateGovernance({
      votingDelay: preset.votingDelay,
      votingPeriod: preset.votingPeriod,
      quorumBps: preset.quorumBps,
      proposalThresholdBps: preset.proposalThresholdBps
    });
    setShowAdvanced(false);
    clearValidationError('votingDelay');
    clearValidationError('votingPeriod');
    clearValidationError('quorumBps');
    clearValidationError('proposalThresholdBps');
  };

  const sliderValue = Math.min(
    MAX_VOTING_PERIOD,
    Math.max(MIN_VOTING_PERIOD, Math.round(governance.votingPeriod / 3600) * 3600)
  );

  const bpsToPercent = (bps: number) => (bps / 100).toFixed(2);

  const updatePercentage = (field: 'quorumBps' | 'proposalThresholdBps', value: string) => {
    const percentage = Number(value);
    if (Number.isNaN(percentage)) return;
    const bps = Math.round(percentage * 100);
    updateGovernance({ [field]: bps });
    setShowAdvanced(true);
    if (percentage < 0 || percentage > 100) {
      setValidationError(field, 'Enter a percentage between 0% and 100%');
    } else {
      clearValidationError(field);
    }
  };

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="5">
          <div>
            <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              How should your DAO make decisions?
            </Heading>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Choose a starting point. You can change these settings later.
            </Text>
          </div>

          <Stack gap="2">
            <Text style={{ fontWeight: 650 }}>What will your DAO mostly coordinate?</Text>
            <div className="governance-intent-grid" role="group" aria-label="Governance approach">
              {GOVERNANCE_PRESETS.map((preset) => (
                <button
                  className={`governance-option${activePreset === preset.id ? ' is-selected' : ''}${preset.id === 'testing' ? ' is-testing' : ''}`}
                  key={preset.id}
                  type="button"
                  aria-pressed={activePreset === preset.id}
                  onClick={() => applyPreset(preset)}
                >
                  <span className="governance-option__title">{preset.title}</span>
                  <span className="governance-option__description">{preset.description}</span>
                  <span className="governance-option__timing">
                    {formatDuration(preset.votingDelay)} delay / {formatDuration(preset.votingPeriod)} voting
                  </span>
                  <span className="governance-option__timing">
                    {bpsToPercent(preset.quorumBps)}% quorum / {bpsToPercent(preset.proposalThresholdBps)}% to propose
                  </span>
                </button>
              ))}
              <button
                className={`governance-option${activePreset === 'custom' ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={activePreset === 'custom'}
                onClick={() => {
                  setShowAdvanced(true);
                }}
              >
                <span className="governance-option__title">Custom / advanced</span>
                <span className="governance-option__description">Set timings that fit your community.</span>
                <span className="governance-option__timing">Your own timings and voting requirements</span>
              </button>
            </div>
          </Stack>

          <div className="governance-reassurance">
            <Text>
              These are starting points, not permanent choices. You can update your governance settings later as your
              DAO evolves.
            </Text>
          </div>
        </Stack>
      </Card>

      {advancedVisible && (
        <Card p="5">
          <Stack gap="5">
            <div>
              <Heading as="h3" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
                Fine-tune your voting timeline
              </Heading>
              <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                Voting delay is the wait before voting starts. Voting period is how long members can vote.
              </Text>
            </div>

            <DurationInput
              id="votingDelay"
              label="Voting delay"
              value={governance.votingDelay}
              onChange={(seconds) => updateDuration('votingDelay', seconds)}
              helperText="Minimum 5 minutes."
            />
            {validationErrors.votingDelay && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.votingDelay}</Text>
            )}

            <Stack gap="3">
              <div className="governance-slider-heading">
                <Text style={{ fontWeight: 650 }}>Voting period</Text>
                <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                  {formatDuration(governance.votingPeriod)}
                </Text>
              </div>
              <input
                className="governance-slider"
                type="range"
                min={MIN_VOTING_PERIOD}
                max={MAX_VOTING_PERIOD}
                step={3600}
                value={sliderValue}
                aria-label="Voting period in hours"
                onChange={(event) => updateDuration('votingPeriod', Number(event.target.value))}
              />
              <div className="governance-slider-labels" aria-hidden="true">
                <span>1 hour</span>
                <span>15 days</span>
                <span>30 days</span>
              </div>
              <DurationInput
                id="votingPeriod"
                label="Custom voting period"
                value={governance.votingPeriod}
                onChange={(seconds) => updateDuration('votingPeriod', seconds)}
                helperText="Minimum 1 hour. Use the fields when you need an exact duration."
              />
            </Stack>
            {validationErrors.votingPeriod && (
              <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.votingPeriod}</Text>
            )}
          </Stack>
          <div className="governance-advanced-footer">
            <Button type="button" variant="outline" onClick={() => setShowAdvanced(false)}>
              Hide advanced settings
            </Button>
          </div>
        </Card>
      )}

      {!advancedVisible && (
        <div className="governance-advanced-prompt">
          <Text>Need different timings or voting requirements?</Text>
          <Button type="button" variant="outline" onClick={() => setShowAdvanced(true)}>
            Customize settings
          </Button>
        </div>
      )}

      {advancedVisible && (
        <Card p="5">
          <Stack gap="4">
            <div>
              <Heading as="h3" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
                Voting requirements
              </Heading>
              <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                Set what proposals need to pass and who can create them.
              </Text>
            </div>

            <Stack gap="2">
              <label htmlFor="quorumBps">
                <Text style={{ fontWeight: 650 }}>What percentage of votes should be needed to pass a proposal?</Text>
              </label>
              <Input
                id="quorumBps"
                type="number"
                value={bpsToPercent(governance.quorumBps)}
                onChange={(event) => updatePercentage('quorumBps', event.target.value)}
                min="0"
                max="100"
                step="0.01"
              />
              {validationErrors.quorumBps && (
                <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.quorumBps}</Text>
              )}
              <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                Percentage of total supply. Stored precisely as basis points.
              </Text>
            </Stack>

            <Stack gap="2">
              <label htmlFor="proposalThresholdBps">
                <Text style={{ fontWeight: 650 }}>What percentage should someone need to create a proposal?</Text>
              </label>
              <Input
                id="proposalThresholdBps"
                type="number"
                value={bpsToPercent(governance.proposalThresholdBps)}
                onChange={(event) => updatePercentage('proposalThresholdBps', event.target.value)}
                min="0"
                max="100"
                step="0.01"
              />
              {validationErrors.proposalThresholdBps && (
                <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>
                  {validationErrors.proposalThresholdBps}
                </Text>
              )}
              <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
                Percentage of total supply. Stored precisely as basis points.
              </Text>
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
