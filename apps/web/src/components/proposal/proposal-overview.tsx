import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Grid, HStack, Stack } from 'styled-system/jsx';

import { Card, Heading, IconLinkButton, ShortId, Text } from '@/components/ui';
import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerLedgerUrl } from '@/lib/explorer-links';
import { ProposalState } from '@/lib/proposal-state';

import { ProposalStateBadge } from './proposal-state-badge';
import type { ProposalDetail } from './types';

type ProposalOverviewProps = {
  detail: ProposalDetail;
  now: number;
  network: DaoNetworkName;
  actionSlot?: ReactNode;
};

function formatCountdown(target: number, now: number) {
  if (!target) return '—';
  const delta = Math.max(0, target - Math.floor(now / 1000));
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  const seconds = delta % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

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

function getLifecycleSummary(detail: ProposalDetail, now: number) {
  switch (detail.state) {
    case ProposalState.Pending:
      const startTime = hasValidTimestamp(detail.vote_start) ? detail.vote_start : detail.vote_end;
      return {
        eyebrow: 'Voting starts',
        headline: hasValidTimestamp(startTime)
          ? `Voting starts in ${formatCountdown(startTime, now)}`
          : 'Voting has not started yet',
        subline: hasValidTimestamp(startTime)
          ? `Opens ${formatDateTime(startTime)}`
          : 'Waiting for the voting schedule to become available.'
      };
    case ProposalState.Active:
      return {
        eyebrow: 'Voting ends',
        headline: hasValidTimestamp(detail.vote_end)
          ? `Voting ends in ${formatCountdown(detail.vote_end, now)}`
          : 'Voting is active',
        subline: hasValidTimestamp(detail.vote_end)
          ? `Closes ${formatDateTime(detail.vote_end)}`
          : 'Voting end time is not available.'
      };
    case ProposalState.Succeeded:
      return {
        eyebrow: 'Ready to queue',
        headline: `Voting ended ${formatDateTime(detail.vote_end)}`,
        subline: 'This proposal can now be queued for execution.'
      };
    case ProposalState.Queued:
      if (hasValidTimestamp(detail.eta) && detail.eta > Math.floor(now / 1000)) {
        return {
          eyebrow: 'Execution scheduled',
          headline: `Executable in ${formatCountdown(detail.eta, now)}`,
          subline: `ETA ${formatDateTime(detail.eta)}`
        };
      }

      return {
        eyebrow: 'Ready to execute',
        headline: 'Ready to execute now',
        subline: detail.eta ? `ETA was ${formatDateTime(detail.eta)}` : 'The queued proposal can now be executed.'
      };
    case ProposalState.Defeated:
      return {
        eyebrow: 'Finalized',
        headline: 'Proposal defeated',
        subline: hasValidTimestamp(detail.vote_end)
          ? `Voting ended ${formatDateTime(detail.vote_end)}`
          : 'No further action is available.'
      };
    case ProposalState.Canceled:
      return {
        eyebrow: 'Finalized',
        headline: 'Proposal canceled',
        subline: 'This proposal was canceled and is no longer actionable.'
      };
    case ProposalState.Expired:
      return {
        eyebrow: 'Finalized',
        headline: 'Proposal expired',
        subline: 'This proposal expired before it could be completed.'
      };
    case ProposalState.Executed:
      return {
        eyebrow: 'Finalized',
        headline: 'Proposal executed',
        subline: 'Execution has completed. No further action is available.'
      };
    default:
      return {
        eyebrow: 'Timeline',
        headline: 'Not available',
        subline: 'Timeline information is unavailable.'
      };
  }
}

export function ProposalOverview({ detail, now, network, actionSlot }: ProposalOverviewProps) {
  const lifecycle = getLifecycleSummary(detail, now);

  return (
    <Stack gap="3">
      <Card p="4" style={{ background: 'rgba(157, 179, 203, 0.08)', border: '1px solid rgba(157, 179, 203, 0.18)' }}>
        <Grid columns={{ base: 1, lg: actionSlot ? 2 : 1 }} gap="4" alignItems="start">
          <Stack gap="3">
            <div>
              <ProposalStateBadge label={detail.label} />
            </div>
            <Stack gap="1">
              <Text className="label">{lifecycle.eyebrow}</Text>
              <Heading style={{ fontSize: '1.5rem' }}>{lifecycle.headline}</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                {lifecycle.subline}
              </Text>
            </Stack>
          </Stack>
          {actionSlot ? <div className="proposal-overview-action">{actionSlot}</div> : null}
        </Grid>
        <style jsx>{`
          .proposal-overview-action {
            border-top: 1px solid rgba(160, 194, 225, 0.18);
            padding-top: 16px;
          }

          @media (min-width: 1024px) {
            .proposal-overview-action {
              border-inline-start: 1px solid rgba(160, 194, 225, 0.18);
              border-top: 0;
              padding-inline-start: 16px;
              padding-top: 0;
            }
          }
        `}</style>
      </Card>

      <Grid columns={{ base: 1, lg: 3 }} gap="3">
        <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
          <HStack gap="2" justify="space-between">
            <div style={{ minWidth: 0 }}>
              <Text className="label">Snapshot</Text>
              <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>
                Ledger #{detail.vote_snapshot}
              </Text>
            </div>
            <IconLinkButton href={getExplorerLedgerUrl(network, detail.vote_snapshot)} label="Open in Stellar Expert">
              <ArrowUpRight size={12} />
            </IconLinkButton>
          </HStack>
        </Card>
        <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
          <Stack gap="1">
            <Text className="label">Proposer</Text>
            <ShortId value={detail.proposer} />
          </Stack>
        </Card>
        <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)' }}>
          <ShortId value={detail.proposalId} label="Proposal id" />
        </Card>
      </Grid>

      <Card p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)', background: 'rgba(157, 179, 203, 0.06)' }}>
        <Stack gap="3">
          <Stack gap="1">
            <Text className="label">Description</Text>
            <Text
              className="lede"
              style={{
                lineHeight: 1.65,
                margin: 0,
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap'
              }}
            >
              {detail.metadata.description || 'No description provided.'}
            </Text>
          </Stack>
          {detail.metadata.url ? (
            <Stack gap="1">
              <Text className="label">Reference link</Text>
              <a
                href={detail.metadata.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', overflowWrap: 'anywhere' }}
              >
                {detail.metadata.url}
              </a>
            </Stack>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
