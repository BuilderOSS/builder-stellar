'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { PageSection } from '@/components/page-section';
import { useDaoContext } from '@/contexts/dao-context';
import { Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { useGoldskyMemberList } from '@/lib/goldsky-queries';

export default function MemberProfilePage() {
  const { daoId, daoTokenAddress } = useDaoContext();
  const params = useParams<{ address: string }>();
  const address = decodeURIComponent(String(params.address ?? ''));
  const { data, error, isLoading } = useGoldskyMemberList(daoTokenAddress, 1000);
  const member = data?.items.find((item) => item.address === address);

  return (
      <PageSection title="Member profile" description="Membership and voting data indexed for this address.">
        <Card p="5">
          {isLoading ? <Callout variant="info" title="Loading member profile…" /> : null}
          {error ? <Callout variant="error" title="Member profile unavailable" description={error.message} /> : null}
          {!isLoading && !error && !member ? (
            <Callout
              variant="warning"
              title="Member not found"
              description="This address does not currently have indexed membership data."
            />
          ) : null}
          {member ? (
            <div style={{ display: 'grid', gap: '18px' }}>
              <ShortId label="Address" value={member.address} />
              <div className="member-profile-stats">
                <div>
                  <Text className="label" style={{ margin: 0 }}>
                    Voting power
                  </Text>
                  <Heading style={{ margin: '4px 0 0' }}>{member.voting_power}</Heading>
                </div>
                <div>
                  <Text className="label" style={{ margin: 0 }}>
                    Tokens owned
                  </Text>
                  <Heading style={{ margin: '4px 0 0' }}>{member.owned_token_count}</Heading>
                </div>
                <div>
                  <Text className="label" style={{ margin: 0 }}>
                    Last activity ledger
                  </Text>
                  <Heading style={{ margin: '4px 0 0' }}>{member.last_activity_ledger}</Heading>
                </div>
              </div>
            </div>
          ) : null}
          <Link
            href={`/dao/${daoId}/members`}
            className="dashboard-auction__action"
            style={{ width: 'fit-content', marginTop: '18px' }}
          >
            Back to members
          </Link>
        </Card>
      </PageSection>
  );
}
