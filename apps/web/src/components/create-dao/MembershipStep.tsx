'use client';
import { Input, Textarea } from '@/components/ui';
import { configuredCreationNetwork, creationAssets } from '@/lib/create-dao-schema';
import { MAX_MARKETPLACE_FEE_BPS } from '@/lib/governance-limits';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import styles from './workspace.module.css';

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
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={auction.enabled}
            onChange={(e) => store.updateAuction({ enabled: e.target.checked })}
          />
          Launch with auctions
        </label>
        <div className={styles.columns}>
          <CreationField id="auction.paymentAsset" label="Auction payment asset">
            <select
              id="auction.paymentAsset"
              value={auction.paymentAsset}
              onChange={(e) => store.updateAuction({ paymentAsset: e.target.value })}
              style={selectStyle}
            >
              {assets.map((a) => (
                <option key={a.code} value={a.contractId}>
                  {a.code}
                </option>
              ))}
            </select>
          </CreationField>
          <CreationField id="auction.reservePrice" label="Reserve price" hint="Up to 7 decimal places">
            <Input
              id="auction.reservePrice"
              inputMode="decimal"
              value={auction.reservePrice}
              {...fieldAccessibility('auction.reservePrice', errors)}
              onChange={(e) => store.updateAuction({ reservePrice: e.target.value })}
            />
          </CreationField>
          <CreationField id="auction.duration" label="Auction duration (seconds)">
            <Input
              id="auction.duration"
              type="number"
              min={300}
              max={2592000}
              value={Number.isFinite(auction.duration) ? auction.duration : ''}
              {...fieldAccessibility('auction.duration', errors)}
              onChange={(e) => store.updateAuction({ duration: e.target.valueAsNumber })}
            />
          </CreationField>
          <CreationField id="auction.timeBuffer" label="Extension buffer (seconds)">
            <Input
              id="auction.timeBuffer"
              type="number"
              min={1}
              max={86400}
              value={Number.isFinite(auction.timeBuffer) ? auction.timeBuffer : ''}
              {...fieldAccessibility('auction.timeBuffer', errors)}
              onChange={(e) => store.updateAuction({ timeBuffer: e.target.valueAsNumber })}
            />
          </CreationField>
        </div>
      </div>
      <div className={styles.group}>
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={market.enabled}
            onChange={(e) => store.updateMarketplace({ enabled: e.target.checked })}
          />
          Launch with marketplace
        </label>
        <div className={styles.columns}>
          <CreationField id="marketplace.paymentAsset" label="Marketplace payment asset">
            <select
              id="marketplace.paymentAsset"
              value={market.paymentAsset}
              onChange={(e) => store.updateMarketplace({ paymentAsset: e.target.value })}
              style={selectStyle}
            >
              {assets.map((a) => (
                <option key={a.code} value={a.contractId}>
                  {a.code}
                </option>
              ))}
            </select>
          </CreationField>
          <CreationField
            id="marketplace.secondaryFeeBps"
            label="Secondary fee (basis points)"
            hint="100 basis points = 1%"
          >
            <Input
              id="marketplace.secondaryFeeBps"
              type="number"
              min={0}
              max={MAX_MARKETPLACE_FEE_BPS}
              value={Number.isFinite(market.secondaryFeeBps) ? market.secondaryFeeBps : ''}
              {...fieldAccessibility('marketplace.secondaryFeeBps', errors)}
              onChange={(e) => store.updateMarketplace({ secondaryFeeBps: e.target.valueAsNumber })}
            />
          </CreationField>
        </div>
      </div>
      <p className={styles.muted}>
        Payment assets are fixed at creation, including for disabled modules. Mint at least one founder token during
        Setup before Launch.
      </p>
    </div>
  );
}
const selectStyle = {
  minHeight: 44,
  borderRadius: 8,
  padding: '8px 12px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  width: '100%'
};
