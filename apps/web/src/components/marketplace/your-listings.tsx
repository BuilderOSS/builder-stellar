'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { AmountInput, Button, Callout, Chip, Dialog, Field, FieldLabel, ListRow, Section } from '@/components/ui';
import type { NetworkName } from '@/config/networks';
import { parseMarketplaceAmount } from '@/lib/marketplace/amount';
import { marketplaceAssetLabel, marketplaceDisplayAmount } from '@/lib/marketplace/asset-label';
import {
  DEFAULT_LISTING_END,
  formatListingEnd,
  isPendingListing,
  type ListingEndPreset,
  listingEndSeconds,
  type ListTerms,
  sellSequence,
  type SellStep
} from '@/lib/marketplace/sell';
import type { MarketplaceAction, MarketplaceConfig, MarketplaceListing } from '@/lib/marketplace/types';

import { ListingEndField } from './listing-end-field';
import { SellSequence } from './sell-sequence';
import { TradeReview } from './trade-review';

const item = css({ display: 'grid', gap: '2', py: '3', borderBottomWidth: '1px', borderColor: 'rule' });
const actions = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });
const form = css({ display: 'grid', gap: '4' });
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

export const CHANGE_PRICE_INTRO =
  'Changing the price takes two or three signatures: cancel the current listing so your token comes back to you, allow the market to hold it again if needed, then list it at the new price.';

/** How one of your listings stands, in plain words. */
export function yourListingState(listing: MarketplaceListing) {
  if (isPendingListing(listing))
    return { label: 'Updating', meta: 'Confirmed. The market can take a few seconds to show it.' };
  if (listing.status === 'awaiting-expiry')
    return { label: 'Ended', meta: 'Ended without a sale. The market still holds your token until you return it.' };
  return { label: 'For sale', meta: `Ends ${formatListingEnd(listing.expiresAt)}` };
}

/**
 * "Yours": the signed-in member's open and ended resales, with Cancel, Change price and,
 * for an ended listing that still holds the token, Return my token.
 */
export function YourListings({
  listings,
  network,
  config,
  purchasesEnabled,
  onCancelled,
  onListed,
  onRelist
}: {
  listings: MarketplaceListing[];
  network: NetworkName;
  config: MarketplaceConfig | null;
  purchasesEnabled: boolean;
  onCancelled: (listing: MarketplaceListing, hash: string) => void;
  onListed: (terms: ListTerms, hash: string) => void;
  /** Change price stopped after its Cancel: offer to list the token again, preselected. */
  onRelist?: (tokenId: string) => void;
}) {
  const [action, setAction] = useState<{ listing: MarketplaceListing; action: MarketplaceAction } | null>(null);
  const [changing, setChanging] = useState<MarketplaceListing | null>(null);
  const [sequence, setSequence] = useState<{ listing: MarketplaceListing; steps: SellStep[] } | null>(null);
  const shown = listings.filter((listing) => listing.kind === 'secondary');
  const ended = shown.filter((listing) => listing.status === 'awaiting-expiry' && !isPendingListing(listing));
  // A confirmed Cancel hides its row at once; an open review or sequence outlives the row (BUG-012).
  const daoId = (action?.listing ?? sequence?.listing ?? changing ?? shown[0])?.daoId;
  if (!daoId) return null;

  function trade(listing: MarketplaceListing, type: 'cancel' | 'expire') {
    setAction({ listing, action: { action: type, id: listing.id, kind: 'secondary', eventId: listing.eventId } });
  }

  const dialogs = (
    <>
      {action ? (
        <TradeReview
          key={JSON.stringify(action.action)}
          daoId={daoId}
          action={action.action}
          onClose={() => setAction(null)}
          onConfirmed={(hash) => onCancelled(action.listing, hash)}
        />
      ) : null}
      {changing && config ? (
        <ChangePriceDialog
          listing={changing}
          network={network}
          config={config}
          onClose={() => setChanging(null)}
          onContinue={(terms) => {
            setChanging(null);
            setSequence({
              listing: changing,
              steps: sellSequence(terms, {
                action: 'cancel',
                kind: 'secondary',
                id: changing.id,
                eventId: changing.eventId
              })
            });
          }}
        />
      ) : null}
      {sequence ? (
        <SellSequence
          daoId={daoId}
          title="Change the price"
          intro={CHANGE_PRICE_INTRO}
          steps={sequence.steps}
          onStepConfirmed={(step, hash) => {
            if (step.kind === 'cancel') onCancelled(sequence.listing, hash);
            if (step.kind === 'list' && step.action.action === 'list') onListed(step.action, hash);
          }}
          onClose={(confirmed) => {
            const tokenId = sequence.listing.tokenId ?? sequence.listing.id;
            setSequence(null);
            if (confirmed.includes('cancel') && !confirmed.includes('list')) onRelist?.(tokenId);
          }}
        />
      ) : null}
    </>
  );
  return (
    <>
      {shown.length ? (
        <Section title="Your listings">
          {ended.length ? (
            <Callout
              variant="warning"
              title={
                ended.length === 1
                  ? `Your listing of token #${ended[0]!.tokenId} has ended`
                  : `${ended.length} of your listings have ended`
              }
              description="The market still holds your token. Return it to your wallet to vote with it again or list it once more."
            />
          ) : null}
          <div>
            {shown.map((listing) => {
              const state = yourListingState(listing);
              const asset = marketplaceAssetLabel(network, listing.paymentAsset);
              const pending = isPendingListing(listing);
              return (
                <div key={listing.eventId} className={item}>
                  <ListRow
                    wrap
                    title={`Token #${listing.tokenId} · ${marketplaceDisplayAmount(network, listing.paymentAsset, listing.price)} ${asset}`}
                    meta={state.meta}
                    trailing={
                      <Chip tone={pending ? 'neutral' : listing.status === 'awaiting-expiry' ? 'warning' : 'yours'}>
                        {state.label}
                      </Chip>
                    }
                  />
                  {pending ? null : listing.status === 'awaiting-expiry' ? (
                    <div className={actions}>
                      <Button size="sm" onClick={() => trade(listing, 'expire')}>
                        Return my token
                      </Button>
                    </div>
                  ) : listing.status === 'open' ? (
                    <div className={actions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!config || !purchasesEnabled}
                        onClick={() => setChanging(listing)}
                      >
                        Change price
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => trade(listing, 'cancel')}>
                        Cancel listing
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}
      {/* Outside the section, so they keep their state when the last row hides. */}
      {dialogs}
    </>
  );
}

function ChangePriceDialog({
  listing,
  network,
  config,
  onClose,
  onContinue
}: {
  listing: MarketplaceListing;
  network: NetworkName;
  config: MarketplaceConfig;
  onClose: () => void;
  onContinue: (terms: ListTerms) => void;
}) {
  const asset = marketplaceAssetLabel(network, config.paymentAsset);
  const [price, setPrice] = useState('');
  const [preset, setPreset] = useState<ListingEndPreset>(DEFAULT_LISTING_END);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  function next() {
    try {
      parseMarketplaceAmount(price);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enter a price.');
      return;
    }
    const end = listingEndSeconds(preset, custom);
    if (!end) {
      setMessage('Choose when the listing ends, in the future.');
      return;
    }
    onContinue({
      action: 'list',
      tokenId: listing.tokenId ?? listing.id,
      price,
      expiresAt: String(end),
      paymentAsset: config.paymentAsset,
      feeBps: config.feeBps
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Change the price of token #${listing.tokenId}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={next}>Continue</Button>
        </>
      }
    >
      <div className={form}>
        <p className={note}>{CHANGE_PRICE_INTRO}</p>
        <p className={note}>
          Now: {marketplaceDisplayAmount(network, listing.paymentAsset, listing.price)}{' '}
          {marketplaceAssetLabel(network, listing.paymentAsset)}.
        </p>
        <Field>
          <FieldLabel htmlFor="change-price">New price</FieldLabel>
          <AmountInput
            id="change-price"
            unit={asset}
            inputMode="decimal"
            value={price}
            placeholder="10"
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <ListingEndField
          id="change-expiry"
          preset={preset}
          custom={custom}
          onPresetChange={setPreset}
          onCustomChange={setCustom}
        />
        {message ? <Callout variant="warning" title={message} role="alert" /> : null}
      </div>
    </Dialog>
  );
}
