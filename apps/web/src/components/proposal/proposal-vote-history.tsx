import { Grid, Stack } from 'styled-system/jsx';

import { Card, ShortId, Text } from '@/components/ui';

import type { ProposalVoteItem } from './types';

type ProposalVoteHistoryProps = {
  votes: ProposalVoteItem[];
  voteLabelForSupport: (support: number) => string;
  formatTimestamp: (timestamp: number) => string;
};

export function ProposalVoteHistory({ votes, voteLabelForSupport, formatTimestamp }: ProposalVoteHistoryProps) {
  return (
    <Card p="5">
      <Stack gap="3">
        <Text className="label">Votes</Text>
        {!votes.length ? (
          <Text className="lede" style={{ margin: 0 }}>
            No votes indexed yet.
          </Text>
        ) : (
          <Grid columns={{ base: 1, xl: 2 }} gap="3">
            {votes.map((vote) => (
              <Card key={vote.id} p="4">
                <Stack gap="1">
                  <ShortId value={vote.voter} label={voteLabelForSupport(vote.support)} />
                  <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                    Weight {vote.weight}
                  </Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                    {vote.reason || 'No reason provided'}
                  </Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                    {formatTimestamp(vote.timestamp)} | Ledger {vote.ledger}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Card>
  );
}
