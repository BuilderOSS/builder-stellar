'use client';

import { useState } from 'react';

import { formatMarketplaceAmount, marketplaceFee, parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel } from '@/lib/marketplace/asset-label';
import { useMarketplaceInventory, useMarketplaceReadiness } from '@/lib/marketplace/hooks';
import type { DaoMarketplace, MarketplaceAction } from '@/lib/marketplace/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace.module.css';
import { TradeReview } from './trade-review';

export function SellForm({ data }: { data: DaoMarketplace }) {
  const auth = useAuthSessionStore((s) => s.authStatus);
  const [page, setPage] = useState(0);
  const inventory = useMarketplaceInventory(data.community.daoId, page);
  const [tokenId, setTokenId] = useState('');
  const [price, setPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [action, setAction] = useState<MarketplaceAction | null>(null);
  const [approved, setApproved] = useState('');
  const [message, setMessage] = useState('');
  const config = data.config;
  const readiness = useMarketplaceReadiness(data.community.daoId, config?.paymentAsset ?? null, true);
  if (!config) return <p>Live marketplace configuration must be available before listing a token.</p>;
  const asset = marketplaceAssetLabel(data.network, config.paymentAsset);
  const supportedAsset = ['XLM', 'USDC'].includes(asset);
  const enabled = data.launched && !config.paused && auth === 'authenticated' && supportedAsset;
  let proceeds = '';
  try {
    const amount = parseMarketplaceAmount(price);
    proceeds = formatMarketplaceAmount(amount - marketplaceFee(amount.toString(), config.feeBps));
  } catch {
    /* validated on explicit review */
  }
  function review(next: 'approve' | 'list') {
    setMessage('');
    try {
      parseMarketplaceAmount(price);
      if (!tokenId) throw new Error('Select a token from your indexed inventory.');
      const expiry = Math.floor(new Date(expiresAt).getTime() / 1000);
      if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000))
        throw new Error('Choose a future expiry date and time.');
      setAction({
        action: next,
        tokenId,
        price,
        expiresAt: String(expiry),
        paymentAsset: config!.paymentAsset,
        feeBps: config!.feeBps
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check listing details.');
    }
  }
  return (
    <section className={styles.panel} aria-labelledby="sell-title">
      <div className={styles.stack}>
        <div>
          <p className={styles.eyebrow}>Secondary marketplace</p>
          <h2 id="sell-title">Sell a token you own</h2>
          <p>
            Two separate transactions: approve this token, then transfer it into marketplace escrow. An approval alone
            is not a listing.
          </p>
          <p>
            While a token is listed, its vote leaves your delegate (escrowed tokens carry no votes). It returns when you
            cancel, or moves to the buyer when the token sells.
          </p>
        </div>
        {!enabled ? (
          <p className={styles.notice}>
            {auth !== 'authenticated'
              ? 'Connect and authenticate your wallet to view inventory and sell.'
              : !supportedAsset
                ? 'This interface supports pricing with verified XLM or USDC SAC assets only. Unknown token decimals are not inferred.'
                : 'New listings are unavailable while the marketplace is paused or not launched.'}
          </p>
        ) : null}
        {inventory.error ? <p role="alert">{inventory.error.message}</p> : null}
        {inventory.isLoading ? <p role="status">Loading your indexed inventory…</p> : null}
        {inventory.data && !inventory.data.tokenIds.length ? (
          <p>No owned tokens indexed on this page. Recently purchased tokens may take a few seconds to appear.</p>
        ) : null}
        <div className={styles.formGrid}>
          <label>
            Owned token
            <select
              value={tokenId}
              disabled={auth !== 'authenticated'}
              onChange={(e) => {
                setTokenId(e.target.value);
                setApproved('');
              }}
            >
              <option value="">Select a token</option>
              {inventory.data?.tokenIds.map((id) => (
                <option key={id} value={id}>
                  Token #{id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Price in {asset}
            <input
              inputMode="decimal"
              value={price}
              disabled={!enabled}
              placeholder="10.0000000"
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            Expires at (your local time)
            <input
              type="datetime-local"
              value={expiresAt}
              disabled={!enabled}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
        </div>
        {page > 0 || inventory.data?.hasMore ? (
          <div className={styles.row}>
            <button
              type="button"
              disabled={page === 0}
              onClick={() => {
                setPage(page - 1);
                setTokenId('');
              }}
            >
              Previous inventory
            </button>
            <button
              type="button"
              disabled={!inventory.data?.hasMore}
              onClick={() => {
                setPage(page + 1);
                setTokenId('');
              }}
            >
              More owned tokens
            </button>
          </div>
        ) : null}
        <p>
          Fee at listing time: <strong>{config.feeBps} bps</strong>
          {proceeds ? ` · Seller receives ${proceeds} ${asset}` : ''}. The listing transaction carries this fee and
          payment asset as your limits: if governance changes either before confirmation, the listing fails and you can
          review the new terms.
        </p>
        <p className={styles.address}>Payment SAC: {config.paymentAsset}</p>
        {readiness.data?.issues.map((issue) => (
          <p key={issue}>{issue}</p>
        ))}
        {readiness.data?.canAddTrustline ? (
          <button type="button" onClick={() => setAction({ action: 'trustline', paymentAsset: config.paymentAsset })}>
            Review adding USDC trustline
          </button>
        ) : null}
        <div className={styles.row}>
          <button type="button" disabled={!enabled || !tokenId} onClick={() => review('approve')}>
            1. Review token approval
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!enabled || !tokenId}
            onClick={() => review('list')}
          >
            2. Review escrow listing
          </button>
        </div>
        {approved === tokenId && tokenId ? (
          <p className={styles.notice}>
            Approval confirmed for token #{tokenId}. It is limited to 120 ledgers from preparation, not a clock timer;
            review escrow next. Simulation checks that the approval is still active.
          </p>
        ) : (
          <p className={styles.muted}>
            If approval is already active, you can review step 2 directly. Simulation will reject missing or expired
            approval.
          </p>
        )}
        {tokenId ? (
          <button
            type="button"
            disabled={auth !== 'authenticated'}
            onClick={() => setAction({ action: 'revoke', tokenId })}
          >
            Review revoking an unused approval
          </button>
        ) : null}
        {message ? <p role="alert">{message}</p> : null}
        {action ? (
          <TradeReview
            key={JSON.stringify(action)}
            daoId={data.community.daoId}
            action={action}
            onClose={() => setAction(null)}
            onConfirmed={() => {
              if (action.action === 'approve') setApproved(action.tokenId);
              if (action.action === 'revoke') setApproved('');
              if (action.action === 'list') {
                setTokenId('');
                setApproved('');
              }
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
