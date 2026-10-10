import type { Route } from 'next';
import NextLink from 'next/link';
import { sva } from 'styled-system/css';

import { VoteTally } from '@/components/ui';
import { relativeTime } from '@/lib/activity-feed';

import { ProposalStateBadge } from './proposal-state-badge';
import type { ProposalListItem } from './types';

const row = sva({
  slots: ['root', 'head', 'number', 'title', 'meta', 'tally'],
  base: {
    root: {
      display: 'grid',
      gap: '2.5',
      py: '3.5',
      px: '3',
      mx: '-3',
      borderRadius: 'control',
      color: 'ink',
      textDecoration: 'none',
      transitionProperty: 'background-color',
      transitionDuration: 'fast',
      '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
      _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-2px' }
    },
    head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' },
    number: { textStyle: 'mono', color: 'ink.muted', mr: '1.5' },
    title: { textStyle: 'subheading', m: '0', overflowWrap: 'anywhere' },
    meta: { textStyle: 'caption', color: 'ink.muted', mt: '0.5' },
    tally: { maxW: '28rem' }
  }
});

function formatVotes(value: number) {
  return new Intl.NumberFormat().format(value);
}

/** One proposal in a list: number, title, when, state and the vote split. */
export function ProposalRow({ item, href }: { item: ProposalListItem; href: string }) {
  const classes = row();
  const when = relativeTime(item.timestamp);
  return (
    <NextLink href={href as Route} className={classes.root}>
      <div className={classes.head}>
        <div>
          <p className={classes.title}>
            <span className={classes.number}>#{item.proposalNumber}</span>
            {item.metadata.title || 'Untitled proposal'}
          </p>
          {when ? <p className={classes.meta}>Proposed {when}</p> : null}
        </div>
        <ProposalStateBadge label={item.stateLabel} />
      </div>
      {item.voteTotals ? (
        <div className={classes.tally}>
          <VoteTally
            compact
            forVotes={item.voteTotals.forVotes}
            againstVotes={item.voteTotals.againstVotes}
            abstainVotes={item.voteTotals.abstainVotes}
            formatValue={formatVotes}
          />
        </div>
      ) : null}
    </NextLink>
  );
}
