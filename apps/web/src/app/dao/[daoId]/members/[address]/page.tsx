'use client';

import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { TokenCard } from '@/components/token/token-card';
import {
  Address,
  Avatar,
  ButtonLink,
  Callout,
  Chip,
  EmptyState,
  IconButton,
  ListRow,
  Pagination,
  Section,
  Skeleton
} from '@/components/ui';
import { muted } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { shortAddress } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
import { useDirectoryMember, useDirectoryTokens } from '@/lib/member-directory/hooks';
import { memberAddress } from '@/lib/member-directory/validation';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const back = css({ justifySelf: 'start', ml: '-3' });
const page = css({ display: 'grid', gap: '6' });
const hero = css({ display: 'flex', alignItems: 'center', gap: '4' });
const heroName = css({ textStyle: 'title', fontSize: { base: '1.5rem', md: '2rem' }, m: '0' });
const stats = css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3', maxW: '28rem' });
const stat = css({ display: 'grid', gap: '0.5', p: '3.5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });
const statValue = css({ textStyle: 'title', fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums' });
const statLabel = css({ textStyle: 'caption', color: 'ink.muted' });
const tokenGrid = css({
  display: 'grid',
  gap: '4',
  gridTemplateColumns: { base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, 1fr)' }
});

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
  const [tokenPage, setTokenPage] = useState(0);
  const viewer = useAuthSessionStore((state) => state.address);
  const profile = useDirectoryMember(daoId, address);
  const inventory = useDirectoryTokens(daoId, address, tokenPage);
  const member = profile.data?.item;
  const isViewer = Boolean(address && viewer === address);

  return (
    <div className={page}>
      <ButtonLink href={daoRoute(daoId, 'members')} variant="ghost" size="sm" className={back}>
        <ChevronLeft aria-hidden="true" />
        Members
      </ButtonLink>

      {!address ? (
        <Callout variant="error" title="That isn't a valid Stellar address" />
      ) : (
        <header className={hero}>
          <Avatar address={address} size="lg" yours={isViewer} />
          <div className={css({ minW: '0', flex: '1' })}>
            <h1 className={heroName}>{isViewer ? 'You' : shortAddress(address)}</h1>
            <Address value={address} compact />
          </div>
          <IconButton
            label="Refresh profile"
            variant="secondary"
            loading={profile.isValidating || inventory.isValidating}
            onClick={() => {
              void profile.mutate();
              void inventory.mutate();
            }}
          >
            {profile.isValidating || inventory.isValidating ? null : <RefreshCw aria-hidden="true" />}
          </IconButton>
        </header>
      )}

      {profile.isLoading ? <Skeleton className={css({ height: '20', maxW: '28rem' })} /> : null}
      {profile.error ? (
        <Callout variant="error" title="This profile didn't load" description={profile.error.message} />
      ) : null}
      {address && profile.data && !profile.error && !member ? (
        <EmptyState title="Not a member right now">
          This address doesn&apos;t hold a token or have votes here at the moment. That doesn&apos;t mean it never took
          part.
        </EmptyState>
      ) : null}
      {member && !profile.error ? (
        <>
          <div className={stats}>
            <div className={stat}>
              <span className={statValue}>{member.owned_token_count}</span>
              <span className={statLabel}>{member.owned_token_count === '1' ? 'Token' : 'Tokens'}</span>
            </div>
            <div className={stat}>
              <span className={statValue}>{member.voting_power}</span>
              <span className={statLabel}>Votes</span>
            </div>
          </div>
          {!member.delegated_to ? (
            <p className={muted}>No delegate set.</p>
          ) : member.delegated_to === member.address ? (
            <div>
              <Chip>Votes for themselves</Chip>
            </div>
          ) : (
            <ListRow
              href={daoRoute(daoId, `members/${member.delegated_to}`)}
              media={<Avatar address={member.delegated_to} size="sm" />}
              title={shortAddress(member.delegated_to)}
              meta="Their votes go to this delegate"
            />
          )}
          <p className={muted}>
            Votes include any delegated to this address and leave out their own if they delegated elsewhere. Delegating
            never moves a token. The directory can lag the chain a little.
          </p>
        </>
      ) : null}

      {address ? (
        <Section title="Tokens">
          {inventory.isLoading ? (
            <div className={tokenGrid} role="status" aria-busy="true">
              <span className="sr-only">Loading tokens</span>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className={css({ aspectRatio: '1', borderRadius: 'card' })} />
              ))}
            </div>
          ) : null}
          {inventory.error ? (
            <Callout variant="error" title="Tokens didn't load" description={inventory.error.message} />
          ) : null}
          {inventory.data && !inventory.error ? (
            <>
              {inventory.data.items.length ? (
                <div className={tokenGrid}>
                  {inventory.data.items.map((token) => (
                    <TokenCard key={token.tokenId} tokenId={token.tokenId} owner={address} />
                  ))}
                </div>
              ) : (
                <p className={muted}>No tokens here. A delegate can have votes without holding tokens.</p>
              )}
              <Pagination
                label="Token pages"
                status={`${inventory.data.total} ${inventory.data.total === 1 ? 'token' : 'tokens'}`}
                hasPrevious={tokenPage > 0}
                hasNext={inventory.data.hasMore}
                onPrevious={() => setTokenPage(tokenPage - 1)}
                onNext={() => setTokenPage(tokenPage + 1)}
                disabled={inventory.isValidating}
              />
            </>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
