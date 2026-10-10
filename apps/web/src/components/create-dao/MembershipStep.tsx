'use client';
import { ArrowLeftRight, Gavel, Mail, Tag } from 'lucide-react';
import { useState } from 'react';

import { ChoiceGroup, Disclosure, DurationInput, Input, Select } from '@/components/ui';
import { MEMBERSHIP_TYPES, type MembershipTypeId, membershipTypeOf } from '@/lib/create-dao-presets';
import { configuredCreationNetwork, creationAssets } from '@/lib/create-dao-schema';
import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import { PercentField } from './PercentField';
import styles from './workspace-styles';

const TYPE_ICONS: Record<MembershipTypeId, typeof Gavel> = {
  auction: Gavel,
  'auction-resale': ArrowLeftRight,
  'fixed-price': Tag,
  invite: Mail
};

const hasErrorIn = (errors: Record<string, string>, prefix: string) =>
  Object.keys(errors).some((key) => key.startsWith(prefix) && errors[key]);

export function MembershipStep() {
  const auction = useCreateDaoStore((s) => s.auction);
  const market = useCreateDaoStore((s) => s.marketplace);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const store = useCreateDaoStore.getState();
  const assets = creationAssets(configuredCreationNetwork());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const type = membershipTypeOf(auction, market);
  const auctionErrors = hasErrorIn(errors, 'auction.');
  const marketErrors = hasErrorIn(errors, 'marketplace.');
  // A hidden field can't be fixed, so a part with errors stays visible even when switched off.
  const showAuction = auction.enabled || auctionErrors;
  const showMarket = market.enabled || marketErrors;
  return (
    <div className={styles.stack}>
      <ChoiceGroup
        variant="card"
        label="How do people join?"
        value={type.id}
        onValueChange={(id) => {
          const next = MEMBERSHIP_TYPES.find((option) => option.id === id);
          if (!next) return;
          store.updateAuction({ enabled: next.auction });
          store.updateMarketplace({ enabled: next.marketplace });
        }}
        options={MEMBERSHIP_TYPES.map((option) => {
          const Icon = TYPE_ICONS[option.id];
          return {
            value: option.id,
            label: option.title,
            description: option.description,
            icon: <Icon aria-hidden="true" strokeWidth={1.75} />,
            badge: option.recommended ? 'Recommended' : undefined
          };
        })}
      />
      <p className={styles.muted}>
        Prices and timings start with sensible defaults. You can change any of this later by a vote.
      </p>
      <Disclosure
        title="Advanced settings"
        open={advancedOpen || auctionErrors || marketErrors}
        onOpenChange={setAdvancedOpen}
      >
        <div className={styles.stack}>
          {showAuction ? (
            <div className={styles.group}>
              <p className={styles.label}>Auctions</p>
              <div className={styles.columns}>
                <CreationField id="auction.paymentAsset" label="Bids are in">
                  <Select
                    id="auction.paymentAsset"
                    value={auction.paymentAsset}
                    onChange={(e) => store.updateAuction({ paymentAsset: e.target.value })}
                  >
                    {assets.map((a) => (
                      <option key={a.code} value={a.contractId}>
                        {a.code}
                      </option>
                    ))}
                  </Select>
                </CreationField>
                <CreationField
                  id="auction.reservePrice"
                  label="Starting price"
                  hint="The lowest first bid. Up to 7 decimals."
                >
                  <Input
                    id="auction.reservePrice"
                    inputMode="decimal"
                    value={auction.reservePrice}
                    {...fieldAccessibility('auction.reservePrice', errors)}
                    onChange={(e) => store.updateAuction({ reservePrice: e.target.value })}
                  />
                </CreationField>
              </div>
              <div className={styles.field}>
                <DurationInput
                  id="auction.duration"
                  label="Each auction lasts"
                  value={Number.isFinite(auction.duration) ? auction.duration : ''}
                  onChange={(duration) => store.updateAuction({ duration })}
                  invalid={Boolean(errors['auction.duration'])}
                  showSeconds={false}
                  helperText="Between 5 minutes and 30 days."
                />
                {errors['auction.duration'] ? <p className={styles.error}>{errors['auction.duration']}</p> : null}
              </div>
              <div className={styles.field}>
                <DurationInput
                  id="auction.timeBuffer"
                  label="A late bid adds"
                  value={Number.isFinite(auction.timeBuffer) ? auction.timeBuffer : ''}
                  onChange={(timeBuffer) => store.updateAuction({ timeBuffer })}
                  invalid={Boolean(errors['auction.timeBuffer'])}
                  helperText="Bids in the last stretch extend the auction by this much, so everyone gets a fair chance."
                />
                {errors['auction.timeBuffer'] ? <p className={styles.error}>{errors['auction.timeBuffer']}</p> : null}
              </div>
            </div>
          ) : null}
          {showMarket ? (
            <div className={styles.group}>
              <p className={styles.label}>Market</p>
              <div className={styles.columns}>
                <CreationField id="marketplace.paymentAsset" label="Prices are in">
                  <Select
                    id="marketplace.paymentAsset"
                    value={market.paymentAsset}
                    onChange={(e) => store.updateMarketplace({ paymentAsset: e.target.value })}
                  >
                    {assets.map((a) => (
                      <option key={a.code} value={a.contractId}>
                        {a.code}
                      </option>
                    ))}
                  </Select>
                </CreationField>
                <CreationField
                  id="marketplace.secondaryFeeBps"
                  label="Fee on resales"
                  hint={`Paid by the seller, up to ${MAX_MARKETPLACE_FEE_BPS / 100}%.`}
                >
                  <PercentField
                    id="marketplace.secondaryFeeBps"
                    min={0}
                    max={MAX_MARKETPLACE_FEE_BPS / 100}
                    bps={market.secondaryFeeBps}
                    {...fieldAccessibility('marketplace.secondaryFeeBps', errors)}
                    onChange={(secondaryFeeBps) => store.updateMarketplace({ secondaryFeeBps })}
                  />
                </CreationField>
              </div>
            </div>
          ) : null}
          {!showAuction && !showMarket ? (
            <p className={styles.muted}>Invite only has nothing to tune here. You mint founder tokens in Setup.</p>
          ) : null}
          <p className={styles.muted}>
            The bid and price assets are fixed once you create the community, even for things you turn off now.
            You&apos;ll mint at least one founder token in Setup before launching.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
