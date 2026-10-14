'use client';

import { useState } from 'react';

import { Address, AmountInput, Button, Callout, Disclosure, Field, FieldLabel, Input, Select } from '@/components/ui';
import { formatMarketplaceAmount, marketplaceFee, parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel } from '@/lib/marketplace/asset-label';
import { useMarketplaceInventory, useMarketplaceReadiness } from '@/lib/marketplace/hooks';
import type { DaoMarketplace, MarketplaceAction } from '@/lib/marketplace/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import styles from './marketplace-styles';
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
  if (!config) return <Callout variant="warning" title="The market's settings didn't load, so you can't list yet." />;
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
      if (!tokenId) throw new Error('Choose one of your tokens.');
      const expiry = Math.floor(new Date(expiresAt).getTime() / 1000);
      if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000))
        throw new Error('Choose when the listing ends, in the future.');
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
          <h2 id="sell-title">Sell a token you own</h2>
          <p className={styles.muted}>
            Two quick signatures: first allow the market to hold your token, then list it. Allowing alone doesn&apos;t
            list it.
          </p>
          <p className={styles.muted}>
            While it&apos;s listed the market holds it, so its vote pauses. You get it back if you cancel; the buyer
            gets it if it sells.
          </p>
        </div>
        {!enabled ? (
          <p className={styles.notice}>
            {auth !== 'authenticated'
              ? 'Connect your wallet to see your tokens and sell one.'
              : !supportedAsset
                ? 'Selling here works with XLM or USDC prices only.'
                : "New listings are paused while the market is paused or hasn't opened."}
          </p>
        ) : null}
        {inventory.error ? (
          <Callout variant="error" title="Your tokens didn't load" description={inventory.error.message} />
        ) : null}
        {inventory.isLoading ? (
          <p className={styles.muted} role="status">
            Loading your tokens…
          </p>
        ) : null}
        {inventory.data && !inventory.data.tokenIds.length ? (
          <p className={styles.muted}>No tokens here. One you just bought can take a few seconds to show up.</p>
        ) : null}
        <div className={styles.formGrid}>
          <Field>
            <FieldLabel htmlFor="sell-token">Your token</FieldLabel>
            <Select
              id="sell-token"
              value={tokenId}
              disabled={auth !== 'authenticated'}
              onChange={(e) => {
                setTokenId(e.target.value);
                setApproved('');
              }}
            >
              <option value="">Choose a token</option>
              {inventory.data?.tokenIds.map((id) => (
                <option key={id} value={id}>
                  Token #{id}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sell-price">Price</FieldLabel>
            <AmountInput
              id="sell-price"
              unit={asset}
              inputMode="decimal"
              value={price}
              disabled={!enabled}
              placeholder="10"
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sell-expiry">Listing ends (your time)</FieldLabel>
            <Input
              id="sell-expiry"
              type="datetime-local"
              value={expiresAt}
              disabled={!enabled}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </div>
        {page > 0 || inventory.data?.hasMore ? (
          <div className={styles.row}>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => {
                setPage(page - 1);
                setTokenId('');
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!inventory.data?.hasMore}
              onClick={() => {
                setPage(page + 1);
                setTokenId('');
              }}
            >
              More tokens
            </Button>
          </div>
        ) : null}
        <p className={styles.muted}>
          Market fee: <strong>{(config.feeBps / 100).toLocaleString()}%</strong>
          {proceeds ? ` · you receive ${proceeds} ${asset}` : ''}. If the tribe changes the fee or price asset before
          your listing confirms, it fails safely and you can review the new terms.
        </p>
        <Disclosure>
          <Address value={config.paymentAsset} label="Price asset contract" compact />
        </Disclosure>
        {readiness.data?.issues.map((issue) => (
          <Callout key={issue} variant="warning" title={issue} />
        ))}
        {readiness.data?.canAddTrustline ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => setAction({ action: 'trustline', paymentAsset: config.paymentAsset })}
            >
              Add a USDC trustline
            </Button>
          </div>
        ) : null}
        <div className={styles.row}>
          <Button variant="secondary" disabled={!enabled || !tokenId} onClick={() => review('approve')}>
            1. Allow the market
          </Button>
          <Button disabled={!enabled || !tokenId} onClick={() => review('list')}>
            2. List it
          </Button>
        </div>
        {approved === tokenId && tokenId ? (
          <p className={styles.notice}>
            The market can now hold #{tokenId} for about 10 minutes. List it next; we check the permission is still
            active first.
          </p>
        ) : (
          <p className={styles.muted}>
            Already allowed it recently? Go straight to step 2. We&apos;ll tell you if the permission expired.
          </p>
        )}
        {tokenId ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={auth !== 'authenticated'}
              onClick={() => setAction({ action: 'revoke', tokenId })}
            >
              Take back an unused permission
            </Button>
          </div>
        ) : null}
        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
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
