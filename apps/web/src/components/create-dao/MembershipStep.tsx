'use client';
import { DurationInput, Input, Select, Switch, Textarea } from '@/components/ui';
import { configuredCreationNetwork, creationAssets } from '@/lib/create-dao-schema';
import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import { PercentField } from './PercentField';
import styles from './workspace-styles';

export function MembershipStep() {
  const basic = useCreateDaoStore((s) => s.basicInfo);
  const auction = useCreateDaoStore((s) => s.auction);
  const market = useCreateDaoStore((s) => s.marketplace);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const store = useCreateDaoStore.getState();
  const assets = creationAssets(configuredCreationNetwork());
  return (
    <div className={styles.stack}>
      <CreationField id="description" label="Description" hint="12–240 characters">
        <Textarea
          id="description"
          rows={3}
          maxLength={240}
          value={basic.description}
          {...fieldAccessibility('description', errors)}
          onChange={(e) => {
            store.updateBasicInfo({ description: e.target.value });
            store.clearValidationError('description');
          }}
        />
      </CreationField>
      <CreationField id="projectUri" label="Website">
        <Input
          id="projectUri"
          type="url"
          value={basic.projectUri}
          {...fieldAccessibility('projectUri', errors)}
          onChange={(e) => store.updateBasicInfo({ projectUri: e.target.value })}
        />
      </CreationField>
      <div className={styles.group}>
        <Switch
          label="Run auctions"
          description="New tokens are auctioned one at a time. Each sale funds the treasury."
          checked={auction.enabled}
          onCheckedChange={(enabled) => store.updateAuction({ enabled })}
        />
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
        <div className={styles.columns}></div>
      </div>
      <div className={styles.group}>
        <Switch
          label="Open a market"
          description="Members can resell tokens, and the community can list new ones by vote."
          checked={market.enabled}
          onCheckedChange={(enabled) => store.updateMarketplace({ enabled })}
        />
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
      <p className={styles.muted}>
        The bid and price assets are fixed once you create the community, even for things you turn off now. You&apos;ll
        mint at least one founder token in Setup before launching.
      </p>
    </div>
  );
}
