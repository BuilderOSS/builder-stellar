'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { NetworkName } from '@/config/networks';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { formatMarketplaceAmount, marketplaceFee } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel, marketplaceDisplayAmount } from '@/lib/marketplace/asset-label';
import { useMarketplaceReadiness } from '@/lib/marketplace/hooks';
import type { MarketplaceAction, MarketplaceCommunity, MarketplaceListing } from '@/lib/marketplace/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace-styles';
import { TradeReview } from './trade-review';

export function ListingCard({
  listing,
  community,
  network,
  trading = false,
  initiallyExpanded = false,
  purchasesEnabled = true
}: {
  listing: MarketplaceListing;
  community: MarketplaceCommunity;
  network: NetworkName;
  trading?: boolean;
  initiallyExpanded?: boolean;
  purchasesEnabled?: boolean;
}) {
  const address = useAuthSessionStore((s) => s.address);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [action, setAction] = useState<MarketplaceAction | null>(null);
  const readiness = useMarketplaceReadiness(
    listing.daoId,
    listing.paymentAsset,
    expanded && trading && listing.status === 'open'
  );
  const asset = marketplaceAssetLabel(network, listing.paymentAsset);
  const status = listing.status.replaceAll('-', ' ');
  let sellerProceeds: string | null = null;
  if (listing.kind === 'secondary') {
    try {
      sellerProceeds = marketplaceDisplayAmount(
        network,
        listing.paymentAsset,
        BigInt(listing.price) - marketplaceFee(listing.price, listing.feeBps)
      );
    } catch {
      /* Cancellation remains possible even if checked i128 fee math would reject a purchase. */
    }
  }
  function trade(type: 'buy' | 'cancel' | 'expire') {
    setAction({ action: type, id: listing.id, kind: listing.kind, eventId: listing.eventId });
  }
  return (
    <article className={styles.card}>
      <div className={styles.row}>
        <span className={styles.chip}>{listing.kind === 'primary' ? 'New mint' : 'Resale'}</span>
        <span className={styles.status}>{status}</span>
      </div>
      <div className={styles.tokenArt} aria-hidden="true">
        {listing.kind === 'primary' ? (
          <span>New</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/render/${encodeURIComponent(community.daoId)}/${listing.tokenId}`} alt="" loading="lazy" />
        )}
      </div>
      <p className={styles.eyebrow}>{community.name}</p>
      <h3>
        {listing.kind === 'primary' ? `New token · listing ${listing.id}` : `${community.name} #${listing.tokenId}`}
      </h3>
      <p className={styles.price}>
        {marketplaceDisplayAmount(network, listing.paymentAsset, listing.price)} <span>{asset}</span>
      </p>
      <p className={styles.muted}>
        {listing.kind === 'primary'
          ? 'Minted to you · the money goes to the treasury'
          : `${(listing.feeBps / 100).toLocaleString()}% market fee, paid by the seller`}
      </p>
      {trading ? (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide details' : 'Details'}
        </button>
      ) : (
        <Link
          className={styles.button}
          href={`/dao/${community.daoId}/marketplace?kind=${listing.kind}&listing=${listing.id}&eventId=${encodeURIComponent(listing.eventId)}`}
        >
          View in community
        </Link>
      )}
      {expanded ? (
        <div className={styles.stack}>
          <dl className={styles.details}>
            <dt>Expires</dt>
            <dd>{new Date(Number(listing.expiresAt) * 1000).toLocaleString()}</dd>
            <dt>Price asset contract</dt>
            <dd className={styles.address}>{listing.paymentAsset}</dd>
            <dt>Created</dt>
            <dd>{listing.createdAt ? new Date(listing.createdAt).toLocaleString() : 'Timestamp not indexed'}</dd>
            {listing.closedAt ? (
              <>
                <dt>Closed</dt>
                <dd>{new Date(listing.closedAt).toLocaleString()}</dd>
              </>
            ) : null}
            {listing.seller ? (
              <>
                <dt>Seller</dt>
                <dd className={styles.address}>{listing.seller}</dd>
                <dt>Seller proceeds</dt>
                <dd>
                  {sellerProceeds === null
                    ? 'Price exceeds the contract fee calculation limit.'
                    : `${sellerProceeds} ${asset}`}
                </dd>
              </>
            ) : null}
            {listing.buyer ? (
              <>
                <dt>Buyer</dt>
                <dd className={styles.address}>{listing.buyer}</dd>
              </>
            ) : null}
            {listing.tokenId && listing.kind === 'primary' ? (
              <>
                <dt>Minted token</dt>
                <dd>#{listing.tokenId}</dd>
              </>
            ) : null}
          </dl>
          {network !== 'local' ? (
            <a href={getExplorerTxUrl(network, listing.transactionHash)} target="_blank" rel="noreferrer">
              Creation transaction ↗
            </a>
          ) : null}
          {readiness.isLoading ? <p role="status">Checking your payment account…</p> : null}
          {readiness.error ? <p role="alert">{readiness.error.message}</p> : null}
          {readiness.data ? (
            <div className={styles.notice}>
              <p>
                Spendable: {formatMarketplaceAmount(readiness.data.available)} {readiness.data.assetCode}
              </p>
              {readiness.data.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
              {readiness.data.canAddTrustline ? (
                <button
                  type="button"
                  onClick={() => setAction({ action: 'trustline', paymentAsset: listing.paymentAsset })}
                >
                  Review adding USDC trustline
                </button>
              ) : null}
            </div>
          ) : null}
          {listing.status === 'open' ? (
            <>
              {!['XLM', 'USDC'].includes(asset) ? (
                <p>You can buy with XLM or USDC here. This listing can still be canceled, or cleared after it ends.</p>
              ) : null}
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.primary}
                  data-variant="primary"
                  onClick={() => trade('buy')}
                  disabled={
                    listing.seller === address ||
                    !['XLM', 'USDC'].includes(asset) ||
                    !purchasesEnabled ||
                    (listing.kind === 'secondary' && sellerProceeds === null)
                  }
                >
                  Buy
                </button>
                {listing.kind === 'secondary' && listing.seller === address ? (
                  <button type="button" onClick={() => trade('cancel')}>
                    Cancel listing
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          {listing.status === 'awaiting-expiry' ? (
            <>
              <p>
                This listing has ended but hasn't been cleared. Clearing returns a resale token to its seller, or
                removes an unsold new listing.
              </p>
              <button type="button" onClick={() => trade('expire')}>
                Clear ended listing
              </button>
            </>
          ) : null}
          <Link href={`/dao/${community.daoId}/marketplace?status=all`}>All listings and sales</Link>
        </div>
      ) : null}
      {action ? (
        <TradeReview
          key={JSON.stringify(action)}
          daoId={listing.daoId}
          action={action}
          onClose={() => setAction(null)}
        />
      ) : null}
    </article>
  );
}
