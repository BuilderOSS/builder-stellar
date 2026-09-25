'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { useProposalEligibility } from '@/lib/proposal-eligibility';
import { selectDraft, selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

export function ProposalDraftIndicator({
  daoId,
  config,
  address
}: {
  daoId: string;
  config: DaoNetworkConfig;
  address: string | null;
}) {
  const router = useRouter();
  const draft = useProposalComposerStore(selectDraft(address, daoId));
  const hasDraft = useProposalComposerStore(selectHasDraft(address, daoId));
  const eligibility = useProposalEligibility(config, address, !hasDraft);

  if (hasDraft && !address) return null;

  const label = hasDraft
    ? `Continue proposal${draft.queuedActions.length ? ` · ${draft.queuedActions.length}` : ''}`
    : 'Create proposal';
  const disabled = !hasDraft && (eligibility.loading || !eligibility.eligible);

  return (
    <span
      className="proposal-create-tooltip"
      tabIndex={disabled && eligibility.message ? 0 : undefined}
      title={disabled ? eligibility.message : undefined}
    >
      <Button
        type="button"
        variant={hasDraft ? undefined : 'outline'}
        size="sm"
        onClick={() => router.push(daoRoute(daoId, 'proposals/create'))}
        disabled={disabled}
      >
        {eligibility.loading && !hasDraft ? 'Checking...' : label}
      </Button>
      {disabled && eligibility.message ? (
        <span className="proposal-create-tooltip__message" role="tooltip">
          {eligibility.message}
        </span>
      ) : null}
    </span>
  );
}
