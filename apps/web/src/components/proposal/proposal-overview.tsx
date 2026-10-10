import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Address, Countdown, Disclosure, Section } from '@/components/ui';
import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerLedgerUrl } from '@/lib/explorer-links';
import { ProposalState } from '@/lib/proposal-state';

import type { ProposalDetail } from './types';

function formatDateTime(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(timestamp * 1000)
    );
  } catch {
    return String(timestamp);
  }
}

function hasValidTimestamp(value: number) {
  return Number.isFinite(value) && value > 0;
}

type Lifecycle = { label: string; headline: ReactNode; subline: string };

function getLifecycleSummary(detail: ProposalDetail, now: number): Lifecycle {
  switch (detail.state) {
    case ProposalState.Pending:
      return {
        label: 'Voting opens soon',
        headline: hasValidTimestamp(detail.vote_start) ? (
          <>
            Opens in <Countdown endsAt={detail.vote_start} endedLabel="a moment" />
          </>
        ) : (
          'Voting has not started yet'
        ),
        subline: hasValidTimestamp(detail.vote_start)
          ? `Opens ${formatDateTime(detail.vote_start)}`
          : 'Waiting for the voting schedule.'
      };
    case ProposalState.Active:
      return {
        label: 'Voting open',
        headline: hasValidTimestamp(detail.vote_end) ? (
          <>
            <Countdown endsAt={detail.vote_end} endedLabel="Closing" /> left to vote
          </>
        ) : (
          'Voting is open'
        ),
        subline: hasValidTimestamp(detail.vote_end)
          ? `Closes ${formatDateTime(detail.vote_end)}`
          : 'The closing time is unavailable.'
      };
    case ProposalState.Succeeded:
      if (detail.expiresAt && now >= detail.expiresAt * 1000)
        return {
          label: 'Queue window closed',
          headline: 'Checking the latest state',
          subline: 'The deadline to queue this proposal has passed.'
        };
      return {
        label: 'Passed',
        headline: 'The vote passed',
        subline: 'Next, anyone can queue it. A short safety delay follows before it can run.'
      };
    case ProposalState.Queued:
      if (!detail.eta)
        return {
          label: 'Queued',
          headline: 'Waiting for its execution time',
          subline: 'The execution time is not available yet.'
        };
      if (detail.expiresAt && now >= detail.expiresAt * 1000)
        return {
          label: 'Execution window closed',
          headline: 'Checking the latest state',
          subline: 'The window to execute this proposal has passed.'
        };
      if (hasValidTimestamp(detail.eta) && detail.eta > Math.floor(now / 1000)) {
        return {
          label: 'Safety delay',
          headline: (
            <>
              Can run in <Countdown endsAt={detail.eta} endedLabel="a moment" />
            </>
          ),
          subline: `Ready ${formatDateTime(detail.eta)}`
        };
      }
      return {
        label: 'Ready',
        headline: 'Ready to execute',
        subline: 'The safety delay is over. Anyone can run it now.'
      };
    case ProposalState.Defeated:
      return {
        label: 'Closed',
        headline: "The vote didn't pass",
        subline: hasValidTimestamp(detail.vote_end) ? `Voting closed ${formatDateTime(detail.vote_end)}` : 'Closed.'
      };
    case ProposalState.Canceled:
      return { label: 'Closed', headline: 'Canceled', subline: 'The proposer withdrew this proposal.' };
    case ProposalState.Expired:
      return { label: 'Closed', headline: 'Expired', subline: 'It passed, but was not executed in time.' };
    case ProposalState.Executed:
      return { label: 'Done', headline: 'Executed', subline: 'Every action in this proposal has run.' };
    default:
      return { label: 'Status', headline: 'Status unavailable', subline: 'Try refreshing in a moment.' };
  }
}

const body = css({
  textStyle: 'body',
  fontSize: '1rem',
  lineHeight: '1.7',
  color: 'ink',
  m: '0',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere'
});
const link = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  color: 'signal',
  textStyle: 'label',
  overflowWrap: 'anywhere',
  '& svg': { width: '4', height: '4', flexShrink: '0' }
});
const facts = css({ display: 'grid', gap: '3' });
const fact = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' });
const factLabel = css({ textStyle: 'caption', color: 'ink.muted' });

export function ProposalOverview({ detail, network }: { detail: ProposalDetail; network: DaoNetworkName }) {
  return (
    <Section title="The proposal">
      <p className={body}>{detail.metadata.description || 'No description was given.'}</p>
      {detail.metadata.url ? (
        <a href={detail.metadata.url} target="_blank" rel="noreferrer" className={link}>
          {detail.metadata.url}
          <ArrowUpRight aria-hidden="true" />
        </a>
      ) : null}
      <Disclosure title="Technical details">
        <div className={facts}>
          <Address value={detail.proposer} label="Proposed by" />
          <Address value={detail.proposalId} label="Proposal id" />
          <div className={fact}>
            <span className={factLabel}>Voting power snapshot</span>
            <a
              href={getExplorerLedgerUrl(network, detail.vote_snapshot)}
              target="_blank"
              rel="noreferrer"
              className={link}
            >
              Ledger {detail.vote_snapshot}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </Disclosure>
    </Section>
  );
}

const panel = css({ display: 'grid', gap: '4', p: '5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });
const label = css({ textStyle: 'label', color: 'ink.muted', m: '0' });
const headline = css({ textStyle: 'title', fontSize: '1.375rem', m: '0', fontVariantNumeric: 'tabular-nums' });
const subline = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '1' });
const slot = css({ borderTopWidth: '1px', borderColor: 'rule', pt: '4' });

/** Where the proposal is in its life, and the one action available now. */
export function ProposalLifecyclePanel({
  detail,
  now,
  actionSlot
}: {
  detail: ProposalDetail;
  now: number;
  actionSlot?: ReactNode;
}) {
  const lifecycle = getLifecycleSummary(detail, now);
  return (
    <section className={panel} aria-labelledby="proposal-lifecycle">
      <div>
        <p className={label}>{lifecycle.label}</p>
        <h2 id="proposal-lifecycle" className={headline}>
          {lifecycle.headline}
        </h2>
        <p className={subline}>{lifecycle.subline}</p>
        {detail.stateSource === 'indexed' ? (
          <p className={subline}>Live chain state is unavailable, so actions are paused until it refreshes.</p>
        ) : null}
      </div>
      {actionSlot ? <div className={slot}>{actionSlot}</div> : null}
    </section>
  );
}
