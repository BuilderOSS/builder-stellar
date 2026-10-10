'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Button, Chip, Text } from '@/components/ui';
import { daoRoute } from '@/lib/dao-routes';
import { ProposalActionQueue } from '@/lib/proposal-actions';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const panel = css({ display: 'grid', gap: '4', p: '5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });
const head = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' });
const title = css({ textStyle: 'heading', fontSize: '1.125rem', m: '0' });
const buttons = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });

/** Changes collected from Manage that will go up for a vote together. */
export function ProposalDraftPanel({ daoId }: { daoId: string }) {
  const address = useAuthSessionStore((state) => state.address);
  const draft = useProposalComposerStore(selectDraft(address || null, daoId));
  const hasDraft = useProposalComposerStore(selectHasDraft(address || null, daoId));
  const reset = useProposalComposerStore((state) => state.reset);
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);
  const count = draft.queuedActions.length;

  return (
    <section className={panel} aria-labelledby="draft-panel-title">
      <div className={head}>
        <h2 id="draft-panel-title" className={title}>
          Your proposal draft
        </h2>
        {hasDraft ? (
          <Chip tone="live">
            {count} {count === 1 ? 'change' : 'changes'}
          </Chip>
        ) : null}
      </div>

      {hasDraft ? (
        <>
          <Text size="sm">These changes go up for a vote together. Add a title and reason, then submit.</Text>
          <ProposalActionQueue daoId={daoId} editable={false} />
          <div className={buttons}>
            <Button onClick={() => router.push(daoRoute(daoId, 'proposals/create'))}>Continue to proposal</Button>
            <Button variant="ghost" onClick={() => setConfirmClear(true)}>
              Discard draft
            </Button>
          </div>
        </>
      ) : (
        <Text size="sm">
          Changes you make here that need a vote collect in a draft, so members can approve them in one proposal.
        </Text>
      )}
      <ProposalActionConfirmDialog
        open={confirmClear}
        title="Discard this draft?"
        message="Every change in it and any proposal details you wrote are removed from this browser."
        confirmLabel="Discard draft"
        tone="danger"
        busy={false}
        onConfirm={() => {
          reset(address, daoId);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
