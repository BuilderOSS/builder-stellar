'use client';
import { Stack } from 'styled-system/jsx';

import { Address, Badge, Card, Heading, Text } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useVoteSource } from '@/lib/vote-source';

/**
 * Where the tribe's voting power comes from (docs/designs/governance-adapter.md). Read from the
 * Governor; fixed when the tribe was created, so there is nothing to change here.
 */
export function VoteSourceCard({ config }: { config: DaoNetworkConfig }) {
  const { voteSource, error } = useVoteSource(config);
  if (!voteSource) {
    return error ? (
      <Card p="5">
        <Stack gap="2">
          <Heading size="heading">How votes are counted</Heading>
          <Text size="sm">The vote source couldn&apos;t be read right now. Try again in a moment.</Text>
        </Stack>
      </Card>
    ) : null;
  }
  return (
    <Card p="5">
      <Stack gap="2">
        <div>
          <Badge tone="outline">Fixed at creation</Badge>
        </div>
        <Heading size="heading">How votes are counted</Heading>
        {voteSource.isToken ? (
          <Text size="sm">Token-weighted: each membership is one vote, and members can delegate their votes.</Text>
        ) : (
          <>
            <Text size="sm">
              Voting power comes from an approved vote source, not from memberships. Delegating a membership
              doesn&apos;t move votes here.
              {voteSource.decimals > 0 ? ` Votes have ${voteSource.decimals} decimal places.` : ''}
            </Text>
            <Address value={voteSource.address} label="Vote source" />
          </>
        )}
      </Stack>
    </Card>
  );
}
