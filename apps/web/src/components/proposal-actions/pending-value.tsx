'use client';

import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Button, Chip } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { showRemovedToast } from '@/lib/proposal-actions/action-toast';
import { removeFromQueue } from '@/lib/proposal-actions/queue';
import type { ProposalActionType, ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const row = css({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '2',
  textStyle: 'caption',
  color: 'ink.muted',
  m: '0'
});
const pendingText = css({ color: 'ink', fontWeight: '600', overflowWrap: 'anywhere' });
const buttons = css({ display: 'flex', gap: '1', flexWrap: 'wrap' });

/** The queued actions of these types in this tribe's proposal draft, in queue order. */
export function usePendingActions(
  types: ProposalActionType | ProposalActionType[] | ((a: ProposalQueuedAction) => boolean)
) {
  const { daoId } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const queued = useProposalComposerStore(selectDraft(address || null, daoId)).queuedActions;
  const matches =
    typeof types === 'function'
      ? types
      : (action: ProposalQueuedAction) => (Array.isArray(types) ? types : [types]).includes(action.type);
  return queued.filter(matches);
}

/**
 * "Now 3 days · In your proposal 5 days" beside a setting, so a page never invites a second, clashing edit
 * without saying one is waiting. Remove undoes from a toast.
 */
export function PendingValue({
  now,
  pending,
  describe = getProposalActionSummary,
  onEdit
}: {
  /** The live value, formatted. Omitted when the contract can't be read. */
  now?: ReactNode;
  pending: ProposalQueuedAction | undefined;
  describe?: (action: ProposalQueuedAction) => string;
  /** Load the queued action into this page's form; saving replaces it in place. */
  onEdit?: () => void;
}) {
  const { daoId } = useDaoContext();
  const address = useAuthSessionStore((state) => state.address);
  const queued = useProposalComposerStore(selectDraft(address || null, daoId)).queuedActions;
  const restore = useProposalComposerStore((state) => state.restore);
  if (!pending) return now === undefined ? null : <p className={row}>Now: {now}</p>;

  return (
    <div className={row} role="status">
      {now === undefined ? null : <span>Now {now}</span>}
      {now === undefined ? null : <span aria-hidden="true">·</span>}
      <Chip tone="live">In your proposal</Chip>
      <span className={pendingText}>{describe(pending)}</span>
      <span className={buttons}>
        {onEdit ? (
          <Button variant="link" size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            if (!address) return;
            restore(address, daoId, removeFromQueue(queued, [pending.id]));
            showRemovedToast({
              address,
              daoId,
              previous: queued,
              label: pending.bundleLabel ? String(pending.bundleLabel) : describe(pending)
            });
          }}
        >
          Remove
        </Button>
      </span>
    </div>
  );
}
