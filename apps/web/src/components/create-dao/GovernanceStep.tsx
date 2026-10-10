'use client';
import { Button, Input } from '@/components/ui';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import styles from './workspace.module.css';

export function GovernanceStep() {
  const governance = useCreateDaoStore((s) => s.governance);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const update = useCreateDaoStore((s) => s.updateGovernance);
  return (
    <div className={styles.stack}>
      <div className={styles.links}>
        <Button
          type="button"
          variant="outline"
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
          Balanced
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            update({ votingDelay: 300, votingPeriod: 3600, queueDelay: 300, quorumBps: 500, proposalThreshold: 1 })
          }
        >
          Fast-moving
        </Button>
      </div>
      <div className={styles.columns}>
        {(['votingDelay', 'votingPeriod', 'queueDelay'] as const).map((field) => (
          <CreationField
            key={field}
            id={field}
            label={
              field === 'votingDelay'
                ? 'Voting delay (seconds)'
                : field === 'votingPeriod'
                  ? 'Voting period (seconds)'
                  : 'Queue delay (seconds)'
            }
            hint="300–2,592,000 seconds"
          >
            <Input
              id={field}
              type="number"
              min={300}
              max={2592000}
              step={1}
              value={Number.isFinite(governance[field]) ? governance[field] : ''}
              {...fieldAccessibility(field, errors)}
              onChange={(e) => update({ [field]: e.target.valueAsNumber })}
            />
          </CreationField>
        ))}
        <CreationField id="quorumBps" label="Quorum (basis points)" hint="100 basis points = 1% of supply">
          <Input
            id="quorumBps"
            type="number"
            min={1}
            max={10000}
            value={Number.isFinite(governance.quorumBps) ? governance.quorumBps : ''}
            {...fieldAccessibility('quorumBps', errors)}
            onChange={(e) => update({ quorumBps: e.target.valueAsNumber })}
          />
        </CreationField>
        <CreationField
          id="proposalThreshold"
          label="Votes needed to propose"
          hint="Absolute whole-token votes, not a percentage"
        >
          <Input
            id="proposalThreshold"
            type="number"
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
  );
}
