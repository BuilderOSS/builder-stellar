'use client';

import Link from 'next/link';
import { useDeferredValue, useState } from 'react';

import { WalletControls } from '@/components/wallet-controls';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { useMarketplaceDirectory, useMarketplaceOffers } from '@/lib/marketplace/hooks';
import { useMarketplacePreferences } from '@/lib/marketplace/preferences';

import { ListingCard } from './listing-card';
import styles from './marketplace.module.css';

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
  return (
    <div className={styles.root}>
      <a href="#marketplace-content" className="skip-link">
        Skip to marketplace
      </a>
      <header className={styles.header}>
        <Link href="/">Stellar communities</Link>
        <div className={styles.row}>
          <span className={styles.chip}>{network.label}</span>
          <WalletControls />
        </div>
      </header>
      <main id="marketplace-content" className={styles.stack}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Discover · collect · participate</p>
          <h1>
            A marketplace for
            <br />
            community ownership.
          </h1>
          <p>
            Find a community first. Buy a newly minted governance NFT to support its Treasury, or trade an existing
            token with another member.
          </p>
        </section>
        <div className={styles.row} role="group" aria-label="Marketplace view">
          <button
            type="button"
            aria-pressed={view === 'communities'}
            onClick={() => {
              setView('communities');
              setPage(0);
            }}
          >
            Communities
          </button>
          <button
            type="button"
            aria-pressed={view === 'offers'}
            onClick={() => {
              setView('offers');
              setPage(0);
            }}
          >
            Primary & secondary offers
          </button>
          <button type="button" className={styles.quiet} onClick={() => update({ home: view })}>
            Use this as my marketplace home
          </button>
        </div>
        <div className={styles.filters}>
          <label>
            Search communities
            <input
              type="search"
              maxLength={120}
              value={search}
              placeholder="Name, symbol, or description"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            Indexed capability
            <select
              value={capability}
              onChange={(e) => {
                setCapability(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">All capabilities</option>
              <option value="marketplace">Marketplace enabled</option>
              <option value="auction">Auction enabled</option>
              <option value="metadata">Metadata module</option>
            </select>
          </label>
          {view === 'offers' ? (
            <label>
              Offer type
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Primary & secondary</option>
                <option value="primary">Primary new mints</option>
                <option value="secondary">Secondary resales</option>
              </select>
            </label>
          ) : (
            <label className={styles.check}>
              <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
              Saved on this device (current page)
            </label>
          )}
        </div>
        <p className={styles.muted}>
          Capabilities come from indexed launch choices and module wiring, not public tags. Saved communities, private
          labels and home preferences stay in this browser only.
        </p>
        {storageIssue ? <p role="status">{storageIssue}</p> : null}
        {result.error ? (
          <div role="alert" className={styles.notice}>
            <p>{result.error.message}</p>
            <button type="button" onClick={() => void result.mutate()}>
              Retry loading
            </button>
          </div>
        ) : null}
        {result.isLoading ? (
          <p role="status" className={styles.notice}>
            Loading marketplace from the indexed deployment…
          </p>
        ) : null}
        {view === 'communities' ? (
          <section className={styles.grid} aria-label="Community directory">
            {communities.map((community) => {
              const saved = preferences.favorites.includes(community.daoId);
              return (
                <article className={styles.card} key={community.daoId}>
                  <div className={styles.row}>
                    <span className={styles.monogram} aria-hidden="true">
                      {community.name.slice(0, 2).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      aria-pressed={saved}
                      aria-label={`${saved ? 'Unsave' : 'Save'} ${community.name} privately`}
                      onClick={() =>
                        update({
                          favorites: saved
                            ? preferences.favorites.filter((id) => id !== community.daoId)
                            : [...preferences.favorites, community.daoId]
                        })
                      }
                    >
                      {saved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  <h2>{community.name}</h2>
                  <p className={styles.eyebrow}>
                    {community.symbol || 'Community'} · {community.status}
                  </p>
                  <p className={styles.description}>
                    {community.description || 'This community has not published a description.'}
                  </p>
                  <div className={styles.row}>
                    {community.capabilities.length ? (
                      community.capabilities.map((c) => (
                        <span className={styles.chip} key={c}>
                          {c === 'metadata' ? 'Metadata module' : `${c} enabled`}
                        </span>
                      ))
                    ) : (
                      <span className={styles.muted}>No enabled capabilities indexed</span>
                    )}
                  </div>
                  <details>
                    <summary>Private label (only on this device)</summary>
                    <label>
                      My label
                      <input
                        maxLength={60}
                        value={preferences.labels[community.daoId] ?? ''}
                        onChange={(e) =>
                          update({ labels: { ...preferences.labels, [community.daoId]: e.target.value } })
                        }
                      />
                    </label>
                  </details>
                  <Link className={styles.button} href={`/dao/${community.daoId}/marketplace`}>
                    Explore marketplace →
                  </Link>
                </article>
              );
            })}
          </section>
        ) : (
          <section className={styles.grid} aria-label="Marketplace offers">
            {offers.data?.listings.map((listing) => {
              const community = offers.data?.communities.find((c) => c.daoId === listing.daoId);
              return community ? (
                <ListingCard key={listing.eventId} listing={listing} community={community} network={network.name} />
              ) : null;
            })}
          </section>
        )}
        {!result.isLoading &&
        !result.error &&
        (view === 'communities' ? communities.length === 0 : offers.data?.listings.length === 0) ? (
          <div className={styles.empty}>
            <h2>No matches on this page</h2>
            <p>
              Try another search or capability. Offers appear after a community creates a primary listing through
              governance or a member escrows an owned token.
            </p>
          </div>
        ) : null}
        <div className={styles.row}>
          <button type="button" disabled={page === 0 || result.isLoading} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button type="button" disabled={!result.data?.hasMore || result.isLoading} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
        <footer className={styles.muted}>
          Verified XLM and USDC prices use exact 7-decimal amounts; unknown assets are shown in base units. An indexed
          offer is not a guarantee of availability; every trade checks live state before you sign.
        </footer>
      </main>
    </div>
  );
}
