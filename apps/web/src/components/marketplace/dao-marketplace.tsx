'use client';

import Link from 'next/link';
import { useState } from 'react';

import { getExplorerTxUrl } from '@/lib/explorer-links';
import { marketplaceAssetLabel, marketplaceDisplayAmount } from '@/lib/marketplace/asset-label';
import { useDaoMarketplace, useMarketplaceListing } from '@/lib/marketplace/hooks';

import { ListingCard } from './listing-card';
import styles from './marketplace.module.css';
import { SellForm } from './sell-form';

export function DaoMarketplaceView({
  daoId,
  initialKind = 'all',
  initialStatus = 'open',
  selectedId = '',
  selectedEventId = ''
}: {
  daoId: string;
  initialKind?: string;
  initialStatus?: string;
  selectedId?: string;
  selectedEventId?: string;
}) {
  const [kind, setKind] = useState(['primary', 'secondary'].includes(initialKind) ? initialKind : 'all');
  const [status, setStatus] = useState(
    ['all', 'open', 'purchased', 'cancelled', 'expired'].includes(initialStatus) ? initialStatus : 'open'
  );
  const [page, setPage] = useState(0);
  const [selling, setSelling] = useState(false);
  const query = new URLSearchParams({ kind, status, page: String(page) }).toString();
  const { data, error, isLoading, mutate } = useDaoMarketplace(daoId, query);
  const selected = useMarketplaceListing(daoId, initialKind, selectedId, selectedEventId);
  return (
    <div className={styles.scoped}>
      <div className={styles.stack}>
        <div className={styles.row}>
          <Link href="/marketplace">← All communities</Link>
          <Link href={`/dao/${daoId}/admin/marketplace`}>Manage through governance</Link>
        </div>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Community marketplace</p>
          <h1>{data?.community.name || 'Marketplace'}</h1>
          <p>
            Primary purchases fund the Treasury and mint directly to you. Secondary purchases transfer an existing
            escrowed token.
          </p>
        </section>
        {error ? (
          <div role="alert" className={styles.notice}>
            <p>{error.message}</p>
            <button type="button" onClick={() => void mutate()}>
              Retry
            </button>
          </div>
        ) : null}
        {isLoading ? <p role="status">Loading community marketplace…</p> : null}
        {data ? (
          <>
            <div className={styles.notice}>
              <div className={styles.row}>
                <strong>
                  {!data.community.marketplaceContract
                    ? 'No marketplace module'
                    : !data.launched
                      ? 'Not launched'
                      : !data.config
                        ? 'Live status unavailable'
                        : data.config.paused
                          ? 'Marketplace paused'
                          : 'Marketplace open'}
                </strong>
                {data.config ? (
                  <span>
                    New listings use {marketplaceAssetLabel(data.network, data.config.paymentAsset)} ·{' '}
                    {data.config.feeBps} bps secondary fee
                  </span>
                ) : null}
              </div>
              <p className={styles.muted}>
                Existing offers keep the asset and fee captured when they were created. Cancellations and expiry
                recovery do not require purchases to be open.
              </p>
              {data.configError ? <p role="alert">{data.configError}</p> : null}
            </div>
            <div className={styles.filters}>
              <label>
                Listing type
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All offers</option>
                  <option value="primary">Primary new mints</option>
                  <option value="secondary">Secondary resales</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="open">Open & awaiting expiry</option>
                  <option value="all">All listing history</option>
                  <option value="purchased">Purchased</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Cleared expired</option>
                </select>
              </label>
              <button type="button" aria-expanded={selling} onClick={() => setSelling(!selling)}>
                {selling ? 'Hide sale form' : 'Sell an owned token'}
              </button>
            </div>
            {selling ? <SellForm data={data} /> : null}
            {selected.error ? <p role="alert">{selected.error.message}</p> : null}
            {selected.isLoading ? <p role="status">Loading selected listing…</p> : null}
            {selected.data ? (
              <section className={styles.panel} aria-label="Selected listing">
                <h2>Selected listing</h2>
                <ListingCard
                  key={selected.data.listing.eventId}
                  listing={selected.data.listing}
                  community={data.community}
                  network={data.network}
                  trading
                  initiallyExpanded
                  purchasesEnabled={Boolean(data.launched && data.config && !data.config.paused)}
                />
              </section>
            ) : null}
            <section className={styles.grid} aria-label="Community listings">
              {data.listings.map((listing) => (
                <ListingCard
                  key={listing.eventId}
                  listing={listing}
                  community={data.community}
                  network={data.network}
                  trading
                  purchasesEnabled={Boolean(data.launched && data.config && !data.config.paused)}
                />
              ))}
            </section>
            {!data.listings.length ? (
              <div className={styles.empty}>
                <h2>No listings match this view</h2>
                <p>
                  Primary listings are created by governance. Members can list tokens they own using the secondary sale
                  form.
                </p>
              </div>
            ) : null}
            <div className={styles.row}>
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>Listing & history page {page + 1}</span>
              <button type="button" disabled={!data.hasMore && !data.salesHasMore} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
            <section className={styles.panel} aria-labelledby="sales-title">
              <h2 id="sales-title">Completed sales</h2>
              <p className={styles.muted}>
                Indexed settlement history. Primary listing IDs are separate from minted token IDs.
              </p>
              {!data.sales.length ? (
                <p>No completed sales indexed on this page.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Sale</th>
                        <th>Token</th>
                        <th>Price</th>
                        <th>Fee</th>
                        <th>Date & transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.map((sale) => (
                        <tr key={sale.eventId}>
                          <td>
                            {sale.kind}
                            {sale.listingId ? ` listing #${sale.listingId}` : ''}
                          </td>
                          <td>#{sale.tokenId}</td>
                          <td>
                            {marketplaceDisplayAmount(data.network, sale.paymentAsset, sale.price)}{' '}
                            {marketplaceAssetLabel(data.network, sale.paymentAsset)}
                          </td>
                          <td>
                            {sale.fee ? marketplaceDisplayAmount(data.network, sale.paymentAsset, sale.fee) : 'None'}
                          </td>
                          <td>
                            {sale.at ? new Date(sale.at).toLocaleString() : 'Timestamp not indexed'}
                            {data.network !== 'local' ? (
                              <>
                                <br />
                                <a
                                  href={getExplorerTxUrl(data.network, sale.transactionHash)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View settlement ↗
                                </a>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
