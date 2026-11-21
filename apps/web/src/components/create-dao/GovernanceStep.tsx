'use client';
import { BrainCircuit, Coins, FastForward, Hourglass, Plug, Scale, Zap } from 'lucide-react';
import { useState } from 'react';

import { Callout, Chip, ChoiceGroup, Disclosure, DurationInput, Input, OptionSelect } from '@/components/ui';
import { applyVotingPace, votingPaceOf, votingPaces } from '@/lib/create-dao-presets';
import { type ApprovedVoteSource, useApprovedVoteSources } from '@/lib/vote-source';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import { PercentField } from './PercentField';
import styles from './workspace-styles';

const PACE_ICONS: Record<string, typeof Zap> = {
  'super-fast': Zap,
  fast: FastForward,
  balanced: Scale,
  deliberate: Hourglass
};
const GOVERNANCE_FIELDS = ['votingDelay', 'votingPeriod', 'queueDelay', 'quorumBps', 'proposalThreshold'] as const;
const TOKEN_SOURCE = 'token';

/**
 * How votes are counted (docs/designs/governance-adapter.md): the tribe's token by default; NQG
 * once it exists on Stellar; or a vote source the platform approved, chosen under Advanced.
 */
export function voteTypeOptions(voteSource: string, approved: ApprovedVoteSource[]) {
  const chosen = approved.find((entry) => entry.source === voteSource);
  return [
    {
      value: TOKEN_SOURCE,
      label: 'Token-weighted',
      description: 'One membership, one vote. Members can delegate their votes.',
      icon: <Coins aria-hidden="true" strokeWidth={1.75} />,
      badge: 'Default'
    },
    {
      value: 'nqg',
      label: 'Neural Quorum Governance (NQG)',
      description: 'Coming once NQG is available on Stellar.',
      icon: <BrainCircuit aria-hidden="true" strokeWidth={1.75} />,
      badge: 'Soon',
      disabled: true
    },
    ...(voteSource
      ? [
          {
            value: voteSource,
            label: chosen?.name ?? 'Approved vote source',
            description: 'Votes come from this approved contract. Change it under Advanced settings.',
            icon: <Plug aria-hidden="true" strokeWidth={1.75} />
          }
        ]
      : [])
  ];
}

export function GovernanceStep() {
  const governance = useCreateDaoStore((s) => s.governance);
  const auction = useCreateDaoStore((s) => s.auction);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const update = useCreateDaoStore((s) => s.updateGovernance);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const paces = votingPaces();
  const pace = votingPaceOf(governance);
  const hasErrors = GOVERNANCE_FIELDS.some((field) => errors[field]) || Boolean(errors.voteSource);
  const approved = useApprovedVoteSources().data ?? [];
  const voteSource = governance.voteSource ?? '';
  return (
    <div className={styles.stack}>
      <ChoiceGroup
        variant="card"
        label="How are votes counted?"
        value={voteSource || TOKEN_SOURCE}
        onValueChange={(value) => {
          if (value === TOKEN_SOURCE) {
            update({ voteSource: '', voteSourceDecimals: 0 });
            useCreateDaoStore.getState().clearValidationError('voteSource');
          }
        }}
        options={voteTypeOptions(voteSource, approved)}
      />
      {voteSource ? (
        <Callout variant="warning" title="This contract decides every member's voting power">
          It is fixed when your tribe is created and can&apos;t be changed later, even by a vote. Memberships still come
          from your tribe&apos;s token.
        </Callout>
      ) : null}
      <ChoiceGroup
        variant="card"
        label="How fast should decisions happen?"
        value={pace?.id ?? null}
        onValueChange={(id) => {
          const next = paces.find((option) => option.id === id);
          if (!next) return;
          const patch = applyVotingPace(next, auction);
          const store = useCreateDaoStore.getState();
          update(patch.governance);
          GOVERNANCE_FIELDS.forEach((field) => store.clearValidationError(field));
          if (patch.auction) {
            store.updateAuction(patch.auction);
            store.clearValidationError('auction.duration');
            store.clearValidationError('auction.timeBuffer');
          }
        }}
        options={paces.map((option) => {
          const Icon = PACE_ICONS[option.id] ?? Scale;
          return {
            value: option.id,
            label: option.title,
            description: option.description,
            icon: <Icon aria-hidden="true" strokeWidth={1.75} />,
            badge: option.recommended ? 'Recommended' : option.testnetOnly ? 'Testnet' : undefined
          };
        })}
      />
      <div className={styles.links}>
        {pace ? null : <Chip tone="outline">Custom</Chip>}
        <span className={styles.muted}>
          {pace
            ? 'You can change any of this later by a vote.'
            : 'Your own timings, set below. You can change them later by a vote.'}
        </span>
      </div>
      <Disclosure title="Advanced settings" open={advancedOpen || hasErrors || !pace} onOpenChange={setAdvancedOpen}>
        <div className={styles.stack}>
          {(['votingDelay', 'votingPeriod', 'queueDelay'] as const).map((field) => (
            <div key={field} className={styles.field}>
              <DurationInput
                id={field}
                label={
                  field === 'votingDelay'
                    ? 'Wait before voting opens'
                    : field === 'votingPeriod'
                      ? 'How long voting stays open'
                      : 'Safety delay before a passed vote runs'
                }
                value={Number.isFinite(governance[field]) ? governance[field] : ''}
                onChange={(seconds) => update({ [field]: seconds })}
                invalid={Boolean(errors[field])}
                showSeconds={false}
                helperText="Between 5 minutes and 30 days."
              />
              {errors[field] ? (
                <p className={styles.error} id={`${field}-error`}>
                  {errors[field]}
                </p>
              ) : null}
            </div>
          ))}
          <div className={styles.columns}>
            <CreationField
              id="quorumBps"
              label="Quorum: share of votes that must take part"
              hint="For and Abstain votes count toward it."
            >
              <PercentField
                id="quorumBps"
                bps={governance.quorumBps}
                onChange={(quorumBps) => update({ quorumBps })}
                {...fieldAccessibility('quorumBps', errors)}
              />
            </CreationField>
            <CreationField
              id="proposalThreshold"
              label="Votes needed to propose"
              hint={
                voteSource
                  ? 'Whole votes from the vote source, not a percentage.'
                  : 'A number of tokens, not a percentage.'
              }
            >
              <Input
                id="proposalThreshold"
                type="number"
                inputMode="numeric"
                min={1}
                max={Number.MAX_SAFE_INTEGER}
                step={1}
                value={Number.isFinite(governance.proposalThreshold) ? governance.proposalThreshold : ''}
                {...fieldAccessibility('proposalThreshold', errors)}
                onChange={(e) => update({ proposalThreshold: e.target.valueAsNumber })}
              />
            </CreationField>
          </div>
          {approved.length > 0 || voteSource ? (
            <div className={styles.stack}>
              <CreationField
                id="voteSource"
                label="Vote source"
                hint="The contract your tribe's Governor reads voting power from. Only sources the platform approved are listed."
              >
                <OptionSelect
                  id="voteSource"
                  label="Vote source"
                  value={voteSource || TOKEN_SOURCE}
                  options={[
                    { value: TOKEN_SOURCE, label: "The tribe's token (token-weighted)" },
                    ...approved.map((entry) => ({ value: entry.source, label: entry.name })),
                    ...(voteSource && !approved.some((entry) => entry.source === voteSource)
                      ? [{ value: voteSource, label: 'No longer approved' }]
                      : [])
                  ]}
                  onValueChange={(value) => {
                    const entry = approved.find((source) => source.source === value);
                    if (entry) update({ voteSource: entry.source, voteSourceDecimals: entry.decimals });
                    else if (value === TOKEN_SOURCE) update({ voteSource: '', voteSourceDecimals: 0 });
                    useCreateDaoStore.getState().clearValidationError('voteSource');
                  }}
                />
              </CreationField>
              {errors.voteSource ? (
                <p className={styles.error} id="voteSource-error">
                  {errors.voteSource}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Disclosure>
    </div>
  );
}
