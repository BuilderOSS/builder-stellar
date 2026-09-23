'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { PageSection } from '@/components/page-section';
import { Callout, Card, Heading, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
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
        {isLoading ? (
          <div role="status" aria-busy="true" className="member-profile-loading">
            <span className="sr-only">Loading member profile</span>
            <Skeleton style={{ width: '220px', height: '1.1em' }} />
            <div className="member-profile-stats">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index}>
                  <Skeleton style={{ width: '100px', height: '0.8em' }} />
                  <Skeleton style={{ width: '80px', height: '1.5em', marginTop: '8px' }} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
