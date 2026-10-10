'use client';

import Link from 'next/link';
import { useState } from 'react';

import styles from '@/components/member-directory/directory.module.css';
import { PageSection } from '@/components/page-section';
import { useDaoContext } from '@/contexts/dao-context';
import { useDirectoryMembers } from '@/lib/member-directory/hooks';
import { memberAddress } from '@/lib/member-directory/validation';

export default function MembersPage() {
  const { daoId, daoConfig } = useDaoContext();
  // Tokens held by these DAO contracts carry no votes and never delegate.
  const systemHolders: Record<string, string> = {
    [daoConfig.treasuryContractId]: 'Treasury',
    [daoConfig.auctionContractId]: 'Auction',
    [daoConfig.marketplaceContractId]: 'Marketplace'
  };
  return <MemberDirectory key={daoId} daoId={daoId} />;
}
function MemberDirectory({ daoId }: { daoId: string }) {
  const [page, setPage] = useState(0);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [lookup, setLookup] = useState('');
  const { data, error, isLoading, isValidating, mutate } = useDirectoryMembers(daoId, page);
  return (
    <PageSection
      title="Members"
      description="Token holders and addresses with delegated votes. Owning tokens and having voting power are different."
    >
      <div className={styles.row} style={{ marginBottom: 16 }}>
        <Link href={`/dao/${daoId}/claims`}>View membership claims →</Link>
      </div>
      <section className={styles.panel}>
        <div className={styles.row}>
          <h2>Member directory</h2>
          <button type="button" disabled={isValidating} onClick={() => void mutate()}>
            {isValidating ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            setMessage('');
            try {
              setLookup(memberAddress(address));
            } catch (error) {
              setLookup('');
              setMessage((error as Error).message);
            }
          }}
        >
          <label className={styles.grow}>
            Find an address
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setLookup('');
              }}
              placeholder="Stellar account or contract address"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <button type="submit">Find profile</button>
        </form>
        {message ? <p role="alert">{message}</p> : null}
        {lookup ? (
          <Link href={`/dao/${daoId}/members/${lookup}`}>
            Open profile for {lookup.slice(0, 8)}…{lookup.slice(-6)}
          </Link>
        ) : null}
        {error ? <p role="alert">{error.message} No member counts are shown until the request succeeds.</p> : null}
        {isLoading ? <p role="status">Loading members…</p> : null}
        {data && !error ? (
          <>
            <p className={styles.muted}>
              {data.total} indexed addresses · sorted by voting power. Delegates can have votes without owning a token.
            </p>
            {data.items.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Tokens owned</th>
                      <th>Voting power</th>
                      <th>Delegates to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((member) => (
                      <tr key={member.address}>
                        <td>
                          <Link title={member.address} href={`/dao/${daoId}/members/${member.address}`}>
                            {member.address.slice(0, 8)}…{member.address.slice(-6)}
                          </Link>
                          {systemHolders[member.address] ? ` · ${systemHolders[member.address]} (DAO contract)` : null}
                        </td>
                        <td>{member.owned_token_count}</td>
                        <td>{member.voting_power}</td>
                        <td>
                          {systemHolders[member.address] ? (
                            'No votes (system holder)'
                          ) : !member.delegated_to ? (
                            'Not set'
                          ) : member.delegated_to === member.address ? (
                            'Self'
                          ) : (
                            <Link title={member.delegated_to} href={`/dao/${daoId}/members/${member.delegated_to}`}>
                              {member.delegated_to.slice(0, 8)}…{member.delegated_to.slice(-6)}
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No holders or delegates indexed on this page.</p>
            )}
            <nav aria-label="Member pages" className={styles.row}>
              <button type="button" disabled={page === 0 || isValidating} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page + 1}
                {data.items.length ? ` · ${data.offset + 1}–${data.offset + data.items.length} of ${data.total}` : ''}
              </span>
              <button type="button" disabled={!data.hasMore || isValidating} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </nav>
          </>
        ) : null}
        {error && page > 0 ? (
          <button type="button" onClick={() => setPage(page - 1)}>
            Return to previous page
          </button>
        ) : null}
      </section>
    </PageSection>
  );
}
