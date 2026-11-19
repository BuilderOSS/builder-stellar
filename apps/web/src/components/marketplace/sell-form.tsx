'use client';

import { Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useWalletSession } from '@/components/shell/wallet-session';
import { Address, AmountInput, Button, Callout, Disclosure, Field, FieldLabel, Select } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useDaoMembership } from '@/hooks/use-dao-membership';
import {
  formatFeePercent,
  formatMarketplaceAmount,
  marketplaceFee,
  parseMarketplaceAmount
} from '@/lib/marketplace/amount';
import { marketplaceAssetLabel } from '@/lib/marketplace/asset-label';
import { useMarketplaceInventory, useMarketplaceReadiness } from '@/lib/marketplace/hooks';
import {
  DEFAULT_LISTING_END,
  type ListingEndPreset,
  listingEndSeconds,
  type ListTerms,
  sellSequence,
  sellVoteWarning
} from '@/lib/marketplace/sell';
import type { DaoMarketplace, MarketplaceAction } from '@/lib/marketplace/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { ListingEndField } from './listing-end-field';
import styles from './marketplace-styles';
import { SellSequence } from './sell-sequence';
import { TradeReview } from './trade-review';

/** Checks the form for List for sale: the terms, or the first problem to fix. */
export function sellTerms(
  input: { tokenId: string; price: string; preset: ListingEndPreset; custom: string },
  config: { paymentAsset: string; feeBps: number },
  nowMs = Date.now()
): ListTerms | string {
  if (!input.tokenId) return 'Choose one of your tokens.';
  try {
    parseMarketplaceAmount(input.price);
  } catch (error) {
    return error instanceof Error ? error.message : 'Enter a price.';
  }
  const end = listingEndSeconds(input.preset, input.custom, nowMs);
  if (!end) return 'Choose when the listing ends, in the future.';
  return {
    action: 'list',
    tokenId: input.tokenId,
    price: input.price,
    expiresAt: String(end),
    paymentAsset: config.paymentAsset,
    feeBps: config.feeBps
  };
}

export function SellForm({
  data,
  initialTokenId = '',
  focusOnOpen = false,
  hiddenTokenIds,
  onListed,
  onFinished
}: {
  data: DaoMarketplace;
  /** From `?sell=<tokenId>`: preselected when the member holds it. */
  initialTokenId?: string;
  /** Scroll to the form and focus the token choice when it opens from a Sell link. */
  focusOnOpen?: boolean;
  /** Tokens just listed, hidden until the indexer moves them out of your tokens. */
  hiddenTokenIds?: Set<string>;
  /** A List confirmed: show it in the list while the indexer catches up. */
  onListed?: (terms: ListTerms, hash: string) => void;
  /** The review closed after a confirmed List: close the form. */
  onFinished?: () => void;
}) {
  const session = useAuthSessionStore();
  const auth = session.authStatus;
  const wallet = useWalletSession();
  const { daoConfig } = useDaoContext();
  const membership = useDaoMembership(daoConfig);
  const [page, setPage] = useState(0);
  const inventory = useMarketplaceInventory(data.community.daoId, page);
  const [tokenId, setTokenId] = useState(initialTokenId);
  const [price, setPrice] = useState('');
  const [preset, setPreset] = useState<ListingEndPreset>(DEFAULT_LISTING_END);
  const [custom, setCustom] = useState('');
  const [steps, setSteps] = useState<ReturnType<typeof sellSequence> | null>(null);
  const [action, setAction] = useState<MarketplaceAction | null>(null);
  const [message, setMessage] = useState('');
  const [listed, setListed] = useState(false);
  const root = useRef<HTMLElement>(null);
  const tokenSelect = useRef<HTMLSelectElement>(null);
  const readiness = useMarketplaceReadiness(data.community.daoId, data.config?.paymentAsset ?? null, true);

  useEffect(() => {
    if (!focusOnOpen) return;
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    tokenSelect.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);

  const config = data.config;
  if (!config) return <Callout variant="warning" title="The market's settings didn't load, so you can't list yet." />;
  const asset = marketplaceAssetLabel(data.network, config.paymentAsset);
  const supportedAsset = ['XLM', 'USDC'].includes(asset);
  const signedIn = auth === 'authenticated';
  const networkIssue = signedIn ? session.walletNetworkIssue : '';
  const enabled = data.launched && !config.paused && signedIn && !networkIssue && supportedAsset;
  const tokenIds = (inventory.data?.tokenIds ?? []).filter((id) => !hiddenTokenIds?.has(id));
  // A token from a Sell link stays choosable while your tokens load, or when it sits on another page.
  // A token from a Sell link is preselected only when it is one of yours (shown while your tokens load).
  if (tokenId && !inventory.data && !hiddenTokenIds?.has(tokenId)) tokenIds.unshift(tokenId);
  const selected = tokenIds.includes(tokenId) ? tokenId : '';
  let proceeds = '';
  try {
    const amount = parseMarketplaceAmount(price);
    proceeds = formatMarketplaceAmount(amount - marketplaceFee(amount.toString(), config.feeBps));
  } catch {
    /* validated on List for sale */
  }
  const member = membership.member;
  const voteWarning = selected
    ? sellVoteWarning({
        customVoteSource: membership.customVoteSource,
        tokenCount:
          membership.tokenCount > 0n
            ? membership.tokenCount
            : BigInt(inventory.data?.hasMore ? 25 : (inventory.data?.tokenIds.length ?? 1)),
        delegated: Boolean(member?.delegated_to && member.delegated_to !== member.address),
        membersOnlyDelegation: daoConfig.tokenSettings.membersOnlyDelegation
      })
    : null;

  function startListing() {
    setMessage('');
    const terms = sellTerms({ tokenId: selected, price, preset, custom }, config!);
    if (typeof terms === 'string') {
      setMessage(terms);
      return;
    }
    setSteps(sellSequence(terms));
  }

  return (
    <section ref={root} id="sell" className={styles.panel} aria-labelledby="sell-title">
      <div className={styles.stack}>
        <div>
          <h2 id="sell-title">Sell a token you own</h2>
          <p className={styles.muted}>
            Listing takes two signatures: one allows the market to hold your token, and the next lists it. If you
            allowed it in the last hour, it takes one.
          </p>
          <p className={styles.muted}>
            While it&apos;s listed, the market holds your token. You get it back if you cancel or the listing ends; the
            buyer gets it if it sells.
          </p>
        </div>
        {!signedIn ? (
          <Callout variant="info" title="Connect your wallet to see your tokens and sell one.">
            <div>
              <Button onClick={() => void wallet.connect()} loading={wallet.isAuthBusy}>
                <Wallet aria-hidden="true" />
                {wallet.isAuthBusy ? 'Check your wallet' : 'Connect wallet'}
              </Button>
            </div>
          </Callout>
        ) : networkIssue ? (
          <Callout variant="warning" title={networkIssue} role="alert" />
        ) : !supportedAsset ? (
          <p className={styles.notice}>Selling here works with XLM or USDC prices only.</p>
        ) : !data.launched || config.paused ? (
          <p className={styles.notice}>New listings are paused while the market is paused or hasn&apos;t opened.</p>
        ) : null}
        {inventory.error ? (
          <Callout variant="error" title="Your tokens didn't load" description={inventory.error.message} />
        ) : null}
        {inventory.isLoading ? (
          <p className={styles.muted} role="status">
            Loading your tokens…
          </p>
        ) : null}
        {inventory.data && !tokenIds.length ? (
          <p className={styles.muted}>No tokens found. A token you bought recently can take a few seconds to appear.</p>
        ) : null}
        <div className={styles.formGrid}>
          <Field>
            <FieldLabel htmlFor="sell-token">Your token</FieldLabel>
            <Select
              ref={tokenSelect}
              id="sell-token"
              value={selected}
              disabled={!signedIn}
              onChange={(e) => setTokenId(e.target.value)}
            >
              <option value="">Choose a token</option>
              {tokenIds.map((id) => (
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
        </div>
        <ListingEndField
          id="sell-expiry"
          preset={preset}
          custom={custom}
          disabled={!enabled}
          onPresetChange={setPreset}
          onCustomChange={setCustom}
        />
        {page > 0 || inventory.data?.hasMore ? (
          <div className={styles.row}>
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={!inventory.data?.hasMore} onClick={() => setPage(page + 1)}>
              More tokens
            </Button>
          </div>
        ) : null}
        {voteWarning ? (
          <Callout variant="warning" title={voteWarning.title} description={voteWarning.description} />
        ) : null}
        <p className={styles.muted}>
          Resale fee: <strong>{formatFeePercent(config.feeBps)}</strong>
          {proceeds ? `. You receive ${proceeds} ${asset} if it sells` : ''}. If the tribe changes the fee or price
          asset before your listing confirms, the listing fails and nothing changes.
        </p>
        <Disclosure>
          <Address value={config.paymentAsset} label="Price asset contract" compact />
        </Disclosure>
        {enabled
          ? readiness.data?.issues.map((issue) => <Callout key={issue} variant="warning" title={issue} />)
          : null}
        {enabled && readiness.data?.canAddTrustline ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => setAction({ action: 'trustline', paymentAsset: config.paymentAsset })}
            >
              Add a USDC trustline
            </Button>
          </div>
        ) : null}
        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
        <div className={styles.row}>
          <Button disabled={!enabled || !selected} onClick={startListing}>
            List for sale
          </Button>
          {selected ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={!signedIn || Boolean(networkIssue)}
              onClick={() => setAction({ action: 'revoke', tokenId: selected })}
            >
              Remove the market&apos;s permission
            </Button>
          ) : null}
        </div>
        {steps ? (
          <SellSequence
            daoId={data.community.daoId}
            title="List your token for sale"
            steps={steps}
            onStepConfirmed={(item, hash) => {
              if (item.kind === 'list' && item.action.action === 'list') {
                onListed?.(item.action, hash);
                setListed(true);
                setTokenId('');
                setPrice('');
              }
            }}
            onClose={() => {
              setSteps(null);
              if (listed) onFinished?.();
            }}
          />
        ) : null}
        {action ? (
          <TradeReview
            key={JSON.stringify(action)}
            daoId={data.community.daoId}
            action={action}
            onClose={() => setAction(null)}
          />
        ) : null}
      </div>
    </section>
  );
}
