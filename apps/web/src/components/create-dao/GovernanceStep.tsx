'use client';
import { FastForward, Hourglass, Scale, Zap } from 'lucide-react';
import { useState } from 'react';

import { Chip, ChoiceGroup, Disclosure, DurationInput, Input } from '@/components/ui';
import { applyVotingPace, votingPaceOf, votingPaces } from '@/lib/create-dao-presets';
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

export function GovernanceStep() {
  const governance = useCreateDaoStore((s) => s.governance);
  const auction = useCreateDaoStore((s) => s.auction);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const update = useCreateDaoStore((s) => s.updateGovernance);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const paces = votingPaces();
  const pace = votingPaceOf(governance);
  const hasErrors = GOVERNANCE_FIELDS.some((field) => errors[field]);
  return (
    <div className={styles.stack}>
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
              hint="A number of tokens, not a percentage."
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
        </div>
      </Disclosure>
    </div>
  );
}
