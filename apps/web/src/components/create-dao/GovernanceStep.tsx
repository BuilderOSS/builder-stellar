'use client';
import { Button, DurationInput, Input } from '@/components/ui';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import { PercentField } from './PercentField';
import styles from './workspace-styles';

export function GovernanceStep() {
  const governance = useCreateDaoStore((s) => s.governance);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const update = useCreateDaoStore((s) => s.updateGovernance);
  return (
    <div className={styles.stack}>
      <div className={styles.links}>
        <span className={styles.muted}>Start from:</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            update({
              votingDelay: 86400,
              votingPeriod: 259200,
              queueDelay: 3600,
              quorumBps: 1000,
              proposalThreshold: 1
            })
          }
        >
          Balanced (days)
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            update({ votingDelay: 300, votingPeriod: 3600, queueDelay: 300, quorumBps: 500, proposalThreshold: 1 })
          }
        >
          Fast (minutes, for testing)
        </Button>
      </div>
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
    </div>
  );
}
