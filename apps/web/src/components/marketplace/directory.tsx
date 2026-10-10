'use client';

import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import { useDeferredValue, useState } from 'react';
import { css } from 'styled-system/css';

import { PageSection } from '@/components/page-section';
import {
  Button,
  ButtonLink,
  Checkbox,
  Chip,
  Crest,
  Disclosure,
  EmptyState,
  ErrorState,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton
} from '@/components/ui';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { useMarketplaceDirectory, useMarketplaceOffers } from '@/lib/marketplace/hooks';
import { useMarketplacePreferences } from '@/lib/marketplace/preferences';

import { ListingCard } from './listing-card';
import styles from './marketplace-styles';

const toolbar = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: { base: '1fr', md: 'minmax(0, 1fr) 220px auto' },
  alignItems: 'center'
});
const viewRow = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '3'
});
const card = css({
  display: 'grid',
  gap: '3',
  p: '4',
  minW: '0',
  bg: 'surface',
  borderRadius: 'card',
  boxShadow: 'raised'
});
const cardHead = css({ display: 'flex', alignItems: 'center', gap: '3' });
const cardName = css({ textStyle: 'heading', fontSize: '1.0625rem', m: '0', overflowWrap: 'anywhere' });
const cardDescription = css({ textStyle: 'body', color: 'ink.muted', m: '0', lineClamp: '3' });
const chips = css({ display: 'flex', flexWrap: 'wrap', gap: '1.5' });
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const skeletonGrid = css({
  display: 'grid',
  gap: '4',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))'
});

const CAPABILITY_LABEL: Record<string, string> = {
  marketplace: 'Market',
  auction: 'Auction',
  metadata: 'Artwork'
};

/** Platform-wide market: communities first, then tokens for sale across them. */
export function MarketplaceDirectoryView() {
  const network = getDeploymentConfig();
  const { preferences, update, storageIssue } = useMarketplacePreferences();
  const [viewOverride, setView] = useState<'communities' | 'offers' | null>(null);
  const view = viewOverride ?? preferences.home;
  const [search, setSearch] = useState('');
  const [capability, setCapability] = useState('all');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());
  const query = new URLSearchParams({ search: deferredSearch, capability, kind, page: String(page) }).toString();
  const directory = useMarketplaceDirectory(query);
  const offers = useMarketplaceOffers(query, view === 'offers');
  const result = view === 'communities' ? directory : offers;
  const communities =
    directory.data?.communities.filter((c) => !savedOnly || preferences.favorites.includes(c.daoId)) ?? [];
  const isEmpty =
    !result.isLoading &&
    !result.error &&
    (view === 'communities' ? communities.length === 0 : offers.data?.listings.length === 0);

  return (
    <div className={styles.root}>
      <PageSection
        title="Market"
        description="Buy a new token to support a community's treasury, or trade with another member."
      >
        <div className={viewRow}>
          <SegmentedControl
            label="Market view"
            value={view}
            onValueChange={(next) => {
              setView(next as 'communities' | 'offers');
              setPage(0);
            }}
            options={[
              { value: 'communities', label: 'Communities' },
              { value: 'offers', label: 'For sale' }
            ]}
          />
          {preferences.home !== view ? (
            <Button variant="ghost" size="sm" onClick={() => update({ home: view })}>
              Open the market here next time
            </Button>
          ) : null}
        </div>

        <div className={toolbar}>
          <SearchInput
            label="Search communities"
            placeholder="Name, symbol or description"
            maxLength={120}
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              setPage(0);
            }}
          />
          <Select
            aria-label="Filter by what a community runs"
            value={capability}
            onChange={(e) => {
              setCapability(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Everything</option>
            <option value="marketplace">Has a market</option>
            <option value="auction">Runs auctions</option>
            <option value="metadata">Has artwork</option>
          </Select>
          {view === 'offers' ? (
            <Select
              aria-label="Offer type"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">New and resale</option>
              <option value="primary">New from the community</option>
              <option value="secondary">Resale from members</option>
            </Select>
          ) : (
            <Checkbox label="Saved only" checked={savedOnly} onCheckedChange={setSavedOnly} />
          )}
        </div>

        {storageIssue ? <p className={note}>{storageIssue}</p> : null}
        {result.error ? (
          <ErrorState
            title="The market didn't load"
            cause={result.error.message}
            actions={
              <Button variant="secondary" onClick={() => void result.mutate()}>
                Try again
              </Button>
            }
          />
        ) : null}
        {result.isLoading ? (
          <div className={skeletonGrid} role="status" aria-busy="true">
            <span className="sr-only">Loading the market</span>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className={css({ height: '56', borderRadius: 'card' })} />
            ))}
          </div>
        ) : null}

        {view === 'communities' ? (
          <section className={styles.grid} aria-label="Communities">
            {communities.map((community) => {
              const saved = preferences.favorites.includes(community.daoId);
              const label = preferences.labels[community.daoId];
              return (
                <article className={card} key={community.daoId}>
                  <div className={cardHead}>
                    <Crest name={community.name} seed={community.tokenContract || community.daoId} size="lg" />
                    <div className={css({ minW: '0', flex: '1' })}>
                      <h2 className={cardName}>{community.name}</h2>
                      <p className={note}>{[community.symbol, label].filter(Boolean).join(' · ') || 'Community'}</p>
                    </div>
                    <IconButton
                      label={`${saved ? 'Unsave' : 'Save'} ${community.name}`}
                      aria-pressed={saved}
                      onClick={() =>
                        update({
                          favorites: saved
                            ? preferences.favorites.filter((id) => id !== community.daoId)
                            : [...preferences.favorites, community.daoId]
                        })
                      }
                    >
                      {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                    </IconButton>
                  </div>
                  {community.description ? <p className={cardDescription}>{community.description}</p> : null}
                  {community.capabilities.length ? (
                    <div className={chips}>
                      {community.capabilities.map((capabilityName) => (
                        <Chip key={capabilityName} tone="outline">
                          {CAPABILITY_LABEL[capabilityName] ?? capabilityName}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                  <Disclosure title="Your private label">
                    <Field>
                      <FieldLabel htmlFor={`label-${community.daoId}`}>Only you see this, on this device</FieldLabel>
                      <Input
                        id={`label-${community.daoId}`}
                        maxLength={60}
                        value={label ?? ''}
                        onChange={(e) =>
                          update({ labels: { ...preferences.labels, [community.daoId]: e.target.value } })
                        }
                      />
                    </Field>
                  </Disclosure>
                  <ButtonLink href={`/dao/${community.daoId}/marketplace` as Route} variant="secondary" block>
                    See what&apos;s for sale
                  </ButtonLink>
                </article>
              );
            })}
          </section>
        ) : (
          <section className={styles.grid} aria-label="For sale">
            {offers.data?.listings.map((listing) => {
              const community = offers.data?.communities.find((c) => c.daoId === listing.daoId);
              return community ? (
                <ListingCard key={listing.eventId} listing={listing} community={community} network={network.name} />
              ) : null;
            })}
          </section>
        )}

        {isEmpty ? (
          <EmptyState
            title="Nothing here yet"
            action={
              search || capability !== 'all' || savedOnly || kind !== 'all' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setCapability('all');
                    setKind('all');
                    setSavedOnly(false);
                    setPage(0);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            Tokens show up once a community lists new ones by vote, or a member puts one up for sale.
          </EmptyState>
        ) : null}

        <Pagination
          label="Market pages"
          page={page + 1}
          hasPrevious={page > 0}
          hasNext={Boolean(result.data?.hasMore)}
          onPrevious={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
          disabled={result.isLoading}
        />
        <p className={note}>
          Saved communities, labels and your market view stay on this device. Every trade checks the live chain before
          you sign, so a listing shown here may already be gone.{' '}
          <NextLink href="/discover" className={css({ color: 'signal' })}>
            Discover communities
          </NextLink>
        </p>
      </PageSection>
    </div>
  );
}
