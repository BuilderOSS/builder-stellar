import { Stack } from 'styled-system/jsx';

import { Card, Text } from '@/components/ui';

import { ProposalQuorumProgress } from './proposal-quorum-progress';

type ProposalVoteSummaryProps = {
  totals: { for: string; against: string; abstain: string };
  quorumVotes: string | null;
};

export function ProposalVoteSummary({ totals, quorumVotes }: ProposalVoteSummaryProps) {
  const forVotes = BigInt(totals.for);
  const againstVotes = BigInt(totals.against);
  const abstainVotes = BigInt(totals.abstain);
  const totalVotes = forVotes + againstVotes + abstainVotes;
  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Vote summary</Text>
        <Text className="lede">Full indexed tally (not the paged vote history)</Text>
        <Text>For: {totals.for}</Text>
        <Text>Against: {totals.against}</Text>
        <Text>Abstain: {totals.abstain}</Text>
        <Text>Total voting power: {totalVotes.toString()}</Text>
        {quorumVotes === null ? (
          <Text>Quorum unavailable</Text>
        ) : (
          <ProposalQuorumProgress
            forVotes={forVotes}
            againstVotes={againstVotes}
            abstainVotes={abstainVotes}
            quorumVotes={BigInt(quorumVotes)}
            totalVotes={totalVotes}
          />
        )}
      </Stack>
    </Card>
  );
}
