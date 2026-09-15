import { Grid, Stack } from 'styled-system/jsx';

import { Card, Text } from '@/components/ui';

import { ProposalQuorumProgress } from './proposal-quorum-progress';
import type { ProposalVoteItem } from './types';

type ProposalVoteSummaryProps = {
  votes: ProposalVoteItem[];
  quorumVotes: string | null;
};

function parseWeight(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function formatWeight(value: bigint) {
  return value.toString();
}

function voteGroupLabel(count: number, weight: bigint) {
  const countLabel = `${count} ${count === 1 ? 'vote' : 'votes'}`;
  return `${formatWeight(weight)} weight • ${countLabel}`;
}

export function ProposalVoteSummary({ votes, quorumVotes }: ProposalVoteSummaryProps) {
  const grouped = votes.reduce(
    (acc, vote) => {
      const weight = parseWeight(vote.weight);
      if (vote.support === 1) {
        acc.forWeight += weight;
        acc.forCount += 1;
      } else if (vote.support === 0) {
        acc.againstWeight += weight;
        acc.againstCount += 1;
      } else {
        acc.abstainWeight += weight;
        acc.abstainCount += 1;
      }
      acc.totalVotes += weight;
      acc.totalCount += 1;
      return acc;
    },
    {
      forWeight: 0n,
      againstWeight: 0n,
      abstainWeight: 0n,
      totalVotes: 0n,
      forCount: 0,
      againstCount: 0,
      abstainCount: 0,
      totalCount: 0
    }
  );

  const quorumValue = quorumVotes ? parseWeight(quorumVotes) : 0n;

  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Vote summary</Text>

        {grouped.totalCount === 0 ? (
          <Text className="lede" style={{ margin: 0 }}>
            No votes yet.
          </Text>
        ) : (
          <Grid columns={{ base: 1, md: 3 }} gap="3">
            <Card p="4">
              <Stack gap="1">
                <Text className="label">For</Text>
                <Text style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  {formatWeight(grouped.forWeight)}
                </Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {voteGroupLabel(grouped.forCount, grouped.forWeight)}
                </Text>
              </Stack>
            </Card>
            <Card p="4">
              <Stack gap="1">
                <Text className="label">Against</Text>
                <Text style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  {formatWeight(grouped.againstWeight)}
                </Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {voteGroupLabel(grouped.againstCount, grouped.againstWeight)}
                </Text>
              </Stack>
            </Card>
            <Card p="4">
              <Stack gap="1">
                <Text className="label">Abstain</Text>
                <Text style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  {formatWeight(grouped.abstainWeight)}
                </Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {voteGroupLabel(grouped.abstainCount, grouped.abstainWeight)}
                </Text>
              </Stack>
            </Card>
          </Grid>
        )}

        {grouped.totalCount > 0 ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            {grouped.totalCount} {grouped.totalCount === 1 ? 'vote' : 'votes'} cast • {formatWeight(grouped.totalVotes)}{' '}
            total voting power
          </Text>
        ) : null}
        <ProposalQuorumProgress
          forVotes={grouped.forWeight}
          againstVotes={grouped.againstWeight}
          abstainVotes={grouped.abstainWeight}
          quorumVotes={quorumValue}
          totalVotes={grouped.totalVotes}
        />
      </Stack>
    </Card>
  );
}
