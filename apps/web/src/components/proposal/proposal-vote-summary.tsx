import { CircleCheck, CircleDashed } from 'lucide-react';
import { css, cx } from 'styled-system/css';

import { Avatar, VoteTally } from '@/components/ui';

type ProposalVoteSummaryProps = {
  totals: { for: string; against: string; abstain: string };
  quorumVotes: string | null;
  /** Most recent voters, newest first (for the avatar row). */
  voters?: string[];
  viewer?: string;
  /** Play the "your vote lands" moment once, right after this wallet votes. */
  celebrateViewer?: boolean;
};

const wrap = css({ display: 'grid', gap: '4' });
const statusList = css({ display: 'grid', gap: '2', listStyle: 'none', m: '0', p: '0' });
const status = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  textStyle: 'caption',
  fontSize: '0.875rem',
  color: 'ink.muted',
  '& svg': { width: '4', height: '4', flexShrink: '0' },
  '&[data-met] svg': { color: 'success' }
});
const votersRow = css({
  display: 'flex',
  alignItems: 'center',
  '& > *:not(:first-child)': { ml: '-1.5' },
  '& > *': { boxShadow: '0 0 0 2px token(colors.surface)' }
});
const land = css({
  animation: 'voteLand 420ms token(easings.out) both',
  '@media (prefers-reduced-motion: reduce)': { animation: 'fadeIn 150ms linear both' }
});

function toBigInt(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function format(value: bigint) {
  return new Intl.NumberFormat().format(value);
}

/**
 * The split, the quorum line and whether it would pass, in words.
 * Quorum counts For and Abstain; passing needs more For than Against.
 */
export function ProposalVoteSummary({
  totals,
  quorumVotes,
  voters = [],
  viewer,
  celebrateViewer
}: ProposalVoteSummaryProps) {
  const forVotes = toBigInt(totals.for);
  const againstVotes = toBigInt(totals.against);
  const abstainVotes = toBigInt(totals.abstain);
  const quorum = quorumVotes === null ? null : toBigInt(quorumVotes);
  const participation = forVotes + abstainVotes;
  const quorumMet = quorum !== null && quorum > 0n && participation >= quorum;
  const approvalMet = forVotes > againstVotes;
  const shownVoters = voters.slice(0, 8);

  return (
    <div className={wrap}>
      <VoteTally
        forVotes={forVotes}
        againstVotes={againstVotes}
        abstainVotes={abstainVotes}
        quorum={quorum && quorum > 0n ? quorum : null}
      />
      <ul className={statusList}>
        <li className={status} data-met={quorumMet ? '' : undefined}>
          {quorumMet ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
          {quorum === null
            ? 'Quorum unavailable'
            : quorumMet
              ? `Quorum reached (${format(participation)} of ${format(quorum)})`
              : `${format(quorum > participation ? quorum - participation : 0n)} more For or Abstain votes to reach quorum`}
        </li>
        <li className={status} data-met={approvalMet ? '' : undefined}>
          {approvalMet ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
          {approvalMet ? 'More For than Against' : 'Needs more For than Against votes'}
        </li>
      </ul>
      {shownVoters.length ? (
        <div className={votersRow} aria-label={`${voters.length} members voted`}>
          {shownVoters.map((address) => {
            const isViewer = Boolean(viewer && address === viewer);
            return (
              <span key={address} className={cx(isViewer && celebrateViewer ? land : undefined)}>
                <Avatar address={address} size="sm" yours={isViewer} />
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
