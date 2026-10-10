import { css } from 'styled-system/css';

import { Avatar, Chip, EmptyState, Section } from '@/components/ui';
import { shortAddress } from '@/lib/activity-feed';

import type { ProposalVoteItem } from './types';

type ProposalVoteHistoryProps = {
  votes: ProposalVoteItem[];
  voteLabelForSupport: (support: number) => string;
  formatTimestamp: (timestamp: number) => string;
  viewer?: string;
};

const list = css({ listStyle: 'none', m: '0', p: '0' });
const item = css({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '3',
  py: '3.5',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const head = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2' });
const who = css({ textStyle: 'body', fontWeight: '600', m: '0' });
const meta = css({ textStyle: 'caption', color: 'ink.muted' });
const reason = css({ textStyle: 'body', color: 'ink.muted', m: '0', mt: '1', overflowWrap: 'anywhere' });

const TONE: Record<string, 'success' | 'danger' | 'neutral'> = {
  For: 'success',
  Against: 'danger',
  Abstain: 'neutral'
};

export function ProposalVoteHistory({ votes, voteLabelForSupport, formatTimestamp, viewer }: ProposalVoteHistoryProps) {
  return (
    <Section title="How members voted" description={votes.length ? `${votes.length} votes` : undefined}>
      {!votes.length ? (
        <EmptyState title="No votes yet">Votes show up here as members cast them.</EmptyState>
      ) : (
        <ul className={list}>
          {votes.map((vote) => {
            const label = voteLabelForSupport(vote.support);
            const isViewer = Boolean(viewer && viewer === vote.voter);
            return (
              <li key={vote.id} className={item}>
                <Avatar address={vote.voter} size="md" yours={isViewer} />
                <div>
                  <div className={head}>
                    <p className={who} title={vote.voter}>
                      {isViewer ? 'You' : shortAddress(vote.voter)}
                    </p>
                    <Chip tone={TONE[label] ?? 'neutral'}>{label}</Chip>
                    <span className={meta}>
                      {vote.weight} {vote.weight === '1' ? 'vote' : 'votes'} · {formatTimestamp(vote.timestamp)}
                    </span>
                  </div>
                  {vote.reason ? <p className={reason}>{vote.reason}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
