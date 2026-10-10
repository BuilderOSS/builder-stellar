'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import styles from '@/components/member-directory/directory.module.css';
import { PageSection } from '@/components/page-section';
import { useDaoContext } from '@/contexts/dao-context';
import { useDirectoryMember, useDirectoryTokens } from '@/lib/member-directory/hooks';
import { memberAddress } from '@/lib/member-directory/validation';

export default function MemberProfilePage() {
  const { daoId } = useDaoContext();
  const { address } = useParams<{ address: string }>();
  let validated: string | null = null;
  try {
    validated = memberAddress(address);
  } catch {
    /* Invalid input never reaches the API. */
  }
  return <Profile key={`${daoId}:${address}`} daoId={daoId} address={validated} />;
}
function Profile({ daoId, address }: { daoId: string; address: string | null }) {
  const [page, setPage] = useState(0);
  const profile = useDirectoryMember(daoId, address);
  const inventory = useDirectoryTokens(daoId, address, page);
  const member = profile.data?.item;
  return (
    <PageSection
      title="Member profile"
      description="Token ownership and delegated voting power for this address—not an administrator role."
    >
      <section className={styles.panel}>
        <div className={styles.row}>
          <Link href={`/dao/${daoId}/members`}>← Members</Link>
          <button
            type="button"
            disabled={!address || profile.isValidating || inventory.isValidating}
            onClick={() => {
              void profile.mutate();
              void inventory.mutate();
            }}
          >
            Refresh
          </button>
        </div>
        {!address ? (
          <p role="alert">This is not a valid Stellar account or contract address.</p>
        ) : (
          <p className={styles.address}>{address}</p>
        )}
        {profile.isLoading ? <p role="status">Loading profile…</p> : null}
        {profile.error ? <p role="alert">{profile.error.message}</p> : null}
        {address && profile.data && !profile.error && !member ? (
          <p>
            No current holder or delegate record is indexed for this address. This does not prove it has never
            participated.
          </p>
        ) : null}
        {member && !profile.error ? (
          <>
            <dl className={styles.stats}>
              <div>
                <dt>Tokens owned</dt>
                <dd>{member.owned_token_count}</dd>
              </div>
              <div>
                <dt>Voting power</dt>
                <dd>{member.voting_power}</dd>
              </div>
              <div>
                <dt>Last indexed ownership ledger</dt>
                <dd>{member.last_activity_ledger ?? 'Not available'}</dd>
              </div>
            </dl>
            <p>
              Voting power includes votes delegated here and excludes your own tokens’ votes when delegated elsewhere.
              Delegation never transfers a token.
            </p>
            <p>
              Delegates to:{' '}
              {!member.delegated_to ? (
                'Not set'
              ) : member.delegated_to === member.address ? (
                'Self'
              ) : (
                <Link className={styles.address} href={`/dao/${daoId}/members/${member.delegated_to}`}>
                  {member.delegated_to}
                </Link>
              )}
              .
            </p>
            <p className={styles.muted}>
              Directory data can lag the chain. Holder controls on a token page check live ownership before signing.
            </p>
          </>
        ) : null}
      </section>
      {address ? (
        <section className={styles.panel}>
          <h2>Owned tokens</h2>
          {inventory.isLoading ? <p role="status">Loading tokens…</p> : null}
          {inventory.error ? <p role="alert">{inventory.error.message}</p> : null}
          {inventory.data && !inventory.error ? (
            <>
              {inventory.data.items.length ? (
                <div className={styles.tokenLinks}>
                  {inventory.data.items.map((token) => (
                    <Link key={token.tokenId} href={`/dao/${daoId}/token/${token.tokenId}`}>
                      Token #{token.tokenId} ↗
                    </Link>
                  ))}
                </div>
              ) : (
                <p>No owned tokens indexed on this page. A delegate may have voting power without owning tokens.</p>
              )}
              <nav aria-label="Owned token pages" className={styles.row}>
                <button type="button" disabled={!page || inventory.isValidating} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page + 1} · {inventory.data.total} owned tokens
                </span>
                <button
                  type="button"
                  disabled={!inventory.data.hasMore || inventory.isValidating}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          ) : null}
          {inventory.error && page > 0 ? (
            <button type="button" onClick={() => setPage(page - 1)}>
              Return to previous token page
            </button>
          ) : null}
        </section>
      ) : null}
    </PageSection>
  );
}
