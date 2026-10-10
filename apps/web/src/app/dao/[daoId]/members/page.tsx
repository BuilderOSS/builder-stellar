'use client';

import { RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { PageSection } from '@/components/page-section';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  FieldHelperText,
  FieldLabel,
  IconButton,
  Input,
  ListRow,
  Pagination,
  Skeleton
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { shortAddress } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
import { useDirectoryMembers } from '@/lib/member-directory/hooks';
import { memberAddress } from '@/lib/member-directory/validation';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const finder = css({ display: 'grid', gap: '2', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end' });
const summary = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const stats = css({ display: 'flex', alignItems: 'center', gap: '2', flexWrap: 'wrap', justifyContent: 'flex-end' });

function formatCount(value: string) {
  try {
    return new Intl.NumberFormat().format(BigInt(value));
  } catch {
    return value;
  }
}

export default function MembersPage() {
  const { daoId } = useDaoContext();
  return <MemberDirectory key={daoId} daoId={daoId} />;
}

function MemberDirectory({ daoId }: { daoId: string }) {
  const { daoConfig, routeId } = useDaoContext();
  const viewer = useAuthSessionStore((state) => state.address);
  // Tokens held by these DAO contracts carry no votes and never delegate.
  const systemHolders: Record<string, string> = {
    [daoConfig.treasuryContractId]: 'Treasury',
    [daoConfig.auctionContractId]: 'Auction',
    [daoConfig.marketplaceContractId]: 'Marketplace'
  };
  const [page, setPage] = useState(0);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [lookup, setLookup] = useState('');
  const { data, error, isLoading, isValidating, mutate } = useDirectoryMembers(daoId, page);

  return (
    <PageSection title="Members" description="Everyone who holds a token or has votes delegated to them.">
      <form
        className={finder}
        onSubmit={(event) => {
          event.preventDefault();
          setMessage('');
          try {
            setLookup(memberAddress(address));
          } catch (lookupError) {
            setLookup('');
            setMessage((lookupError as Error).message);
          }
        }}
      >
        <Field>
          <FieldLabel htmlFor="member-lookup">Find someone</FieldLabel>
          <Input
            id="member-lookup"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setLookup('');
            }}
            placeholder="Stellar address (G… or C…)"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={message ? true : undefined}
          />
        </Field>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Find
        </Button>
        {message ? (
          <FieldHelperText tone="error" className={css({ gridColumn: '1 / -1' })}>
            {message}
          </FieldHelperText>
        ) : null}
      </form>
      {lookup ? (
        <ListRow
          href={daoRoute(routeId, `members/${lookup}`)}
          media={<Avatar address={lookup} />}
          title={shortAddress(lookup)}
          meta="Open their profile"
        />
      ) : null}

      {error ? (
        <ErrorState
          title="Members didn't load"
          cause={`${error.message}. Counts appear once it loads.`}
          actions={
            page > 0 ? (
              <Button variant="secondary" onClick={() => setPage(page - 1)}>
                Back a page
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void mutate()}>
                Try again
              </Button>
            )
          }
        />
      ) : null}

      {isLoading ? (
        <div className={css({ display: 'grid', gap: '2' })} role="status" aria-busy="true">
          <span className="sr-only">Loading members</span>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={css({ height: '14' })} />
          ))}
        </div>
      ) : null}

      {data && !error ? (
        <>
          <div className={summary}>
            <p className={muted}>
              {data.total} {data.total === 1 ? 'member' : 'members'} · most votes first
            </p>
            <IconButton
              label="Refresh members"
              variant="secondary"
              size="sm"
              loading={isValidating}
              onClick={() => void mutate()}
            >
              {isValidating ? null : <RefreshCw aria-hidden="true" />}
            </IconButton>
          </div>
          {data.items.length ? (
            <ul className={css({ listStyle: 'none', m: '0', p: '0' })}>
              {data.items.map((member) => {
                const system = systemHolders[member.address];
                const isViewer = Boolean(viewer && viewer === member.address);
                const delegation = system
                  ? 'Held by the community, no votes'
                  : !member.delegated_to
                    ? 'No delegate set'
                    : member.delegated_to === member.address
                      ? 'Votes for themselves'
                      : `Votes go to ${shortAddress(member.delegated_to)}`;
                return (
                  <ListRow
                    key={member.address}
                    as="li"
                    href={daoRoute(routeId, `members/${member.address}`)}
                    media={<Avatar address={member.address} yours={isViewer} />}
                    title={
                      <span title={member.address}>
                        {isViewer ? 'You' : system ? `${system} (community contract)` : shortAddress(member.address)}
                      </span>
                    }
                    meta={delegation}
                    trailing={
                      <span className={stats}>
                        <Chip tone={isViewer ? 'yours' : 'neutral'}>
                          {formatCount(member.owned_token_count)}{' '}
                          {member.owned_token_count === '1' ? 'token' : 'tokens'}
                        </Chip>
                        <Chip tone="outline">
                          {formatCount(member.voting_power)} {member.voting_power === '1' ? 'vote' : 'votes'}
                        </Chip>
                      </span>
                    }
                  />
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No members here">Nobody holds a token or votes on this page yet.</EmptyState>
          )}
          <Pagination
            label="Member pages"
            page={page + 1}
            status={
              data.items.length
                ? `${data.offset + 1}–${data.offset + data.items.length} of ${data.total}`
                : `Page ${page + 1}`
            }
            hasPrevious={page > 0}
            hasNext={data.hasMore}
            onPrevious={() => setPage(page - 1)}
            onNext={() => setPage(page + 1)}
            disabled={isValidating}
          />
        </>
      ) : null}
    </PageSection>
  );
}
