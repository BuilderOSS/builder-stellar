'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Badge, Button, Card, Heading, Text } from '@/components/ui';
import { ProposalActionQueue } from '@/lib/proposal-actions';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { selectDraft, selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

export function ProposalDraftPanel({ daoId }: { daoId: string }) {
  const address = useDaoSessionStore((state) => state.address);
  const draft = useProposalComposerStore(selectDraft(address || null, daoId));
  const hasDraft = useProposalComposerStore(selectHasDraft(address || null, daoId));
  const reset = useProposalComposerStore((state) => state.reset);
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Card p="5">
      <Stack gap="4">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <Badge>Proposal draft</Badge>
            <Heading style={{ fontSize: '1.2rem', marginTop: '10px' }}>
              {draft.queuedActions.length} {draft.queuedActions.length === 1 ? 'action' : 'actions'} ready
            </Heading>
          </div>
          {hasDraft ? <Badge>{draft.queuedActions.length}</Badge> : null}
        </div>

        {hasDraft ? (
          <>
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              Review the actions you have collected, then continue to the proposal page to add details and submit them
              together.
            </Text>
            <ProposalActionQueue daoId={daoId} editable={false} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="button" onClick={() => router.push(`/dao/${daoId}/proposals/create`)}>
                Continue proposal
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmClear(true)}>
                Clear draft
              </Button>
            </div>
          </>
        ) : (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            Add changes from the admin sections and they will stay here until you are ready to create a proposal.
          </Text>
        )}
      </Stack>
      <ProposalActionConfirmDialog
        open={confirmClear}
        title="Clear proposal draft?"
        message="This will remove the entire proposal draft for this DAO, including its queued actions and any proposal details."
        confirmLabel="Clear draft"
        busy={false}
        onConfirm={() => {
          reset(address, daoId);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </Card>
  );
}
