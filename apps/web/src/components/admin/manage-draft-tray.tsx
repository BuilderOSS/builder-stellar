'use client';

import { useRouter } from 'next/navigation';
import { css } from 'styled-system/css';

import { Button, Chip, Disclosure } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { ProposalActionQueue } from '@/lib/proposal-actions';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

const tray = css({
  display: 'grid',
  gap: '3',
  p: '4',
  borderRadius: 'card',
  bg: 'signal.wash'
});
const head = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3',
  flexWrap: 'wrap'
});
const title = css({ textStyle: 'subheading', fontSize: '0.9375rem', m: '0' });

/** Changes waiting to go up for a vote, shown above every Manage page. */
export function ManageDraftTray({ daoId }: { daoId: string }) {
  const { routeId } = useDaoContext();
  const router = useRouter();
  const address = useAuthSessionStore((state) => state.address);
  const draft = useProposalComposerStore(selectDraft(address || null, daoId));
  const count = draft.queuedActions.length;
  if (!count) return null;

  return (
    <section className={tray} aria-label="Changes waiting for a vote">
      <div className={head}>
        <div className={css({ display: 'flex', alignItems: 'center', gap: '2' })}>
          <Chip tone="live">{count}</Chip>
          <p className={title}>{count === 1 ? 'change' : 'changes'} waiting for a vote</p>
        </div>
        <Button size="sm" onClick={() => router.push(daoRoute(routeId, 'proposals/create'))}>
          Review and propose
        </Button>
      </div>
      <Disclosure title="See changes">
        <ProposalActionQueue daoId={daoId} editable={false} />
      </Disclosure>
    </section>
  );
}
