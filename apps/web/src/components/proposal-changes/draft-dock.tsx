'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { DiscardDraftDialog } from '@/components/drafts/discard-draft-dialog';
import { Button, Chip, Disclosure, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { ProposalActionQueue } from '@/lib/proposal-actions/components/proposal-action-queue';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { changeCount, queueItems } from '@/lib/proposal-changes/queue';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, selectHasDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const dock = css({
  display: 'grid',
  gap: '3',
  p: '4',
  borderRadius: 'card',
  bg: 'signal.wash',
  // The dock appears when the first change lands; it rises in once and never moves after.
  transitionProperty: 'opacity, transform',
  transitionDuration: '200ms',
  transitionTimingFunction: 'out',
  '@starting-style': { opacity: '0', transform: 'translateY(8px)' },
  _motionReduce: { transform: 'none', '@starting-style': { transform: 'none' } }
});
const head = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});
const lead = css({ display: 'flex', alignItems: 'center', gap: '2', minW: '0' });
const titleText = css({ textStyle: 'subheading', fontSize: '0.9375rem', m: '0' });
const latest = css({
  textStyle: 'caption',
  color: 'ink.muted',
  m: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});
const buttons = css({ display: 'flex', gap: '2', flexWrap: 'wrap' });

/**
 * The one visible proposal draft, on every page that can add a change: how many changes are waiting, the
 * latest one, the queue, and the way to the composer. With `overview` it also explains itself when empty.
 */
export function DraftDock({ daoId, overview = false }: { daoId: string; overview?: boolean }) {
  const { routeId } = useDaoContext();
  const router = useRouter();
  const address = useAuthSessionStore((state) => state.address);
  const draft = useProposalComposerStore(selectDraft(address || null, daoId));
  const hasDraft = useProposalComposerStore(selectHasDraft(address || null, daoId));
  const reset = useProposalComposerStore((state) => state.reset);
  const [confirmClear, setConfirmClear] = useState(false);
  const count = changeCount(draft.queuedActions);
  const last = queueItems(draft.queuedActions).at(-1);

  if (!count) {
    return overview ? (
      <Text size="sm">
        Changes you make in Manage that need a vote collect in one proposal draft on this browser, so members can
        approve them together.
      </Text>
    ) : null;
  }

  const lastText = last
    ? last.bundleId
      ? String(last.bundleLabel ?? '')
      : getProposalActionSummary(last.actions[0])
    : '';

  return (
    <section className={dock} aria-label="Your proposal draft">
      <div className={head}>
        <div className={lead}>
          <Chip tone="live">{count}</Chip>
          <p className={titleText}>{count === 1 ? 'change' : 'changes'} waiting for a vote</p>
        </div>
        <div className={buttons}>
          {overview && hasDraft ? (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              Discard draft
            </Button>
          ) : null}
          <Button size="sm" onClick={() => router.push(daoRoute(routeId, 'proposals/create'))}>
            Review proposal
          </Button>
        </div>
      </div>
      {lastText ? <p className={latest}>Latest: {lastText}</p> : null}
      <Disclosure title="See changes" defaultOpen={overview}>
        <ProposalActionQueue daoId={daoId} variant="compact" />
      </Disclosure>
      <DiscardDraftDialog
        open={confirmClear}
        title={draft.metadata.title.trim() || 'Untitled proposal'}
        onDiscard={() => {
          reset(address, daoId);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
