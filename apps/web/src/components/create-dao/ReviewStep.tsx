'use client';
import { useState } from 'react';

import { Input } from '@/components/ui';
import { membershipTypeOf, votingPaceOf } from '@/lib/create-dao-presets';
import { configuredCreationNetwork, creationAssets } from '@/lib/create-dao-schema';
import { formatDuration } from '@/lib/duration';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import styles from './workspace-styles';

export function ReviewStep({ connectedAddress }: { connectedAddress?: string }) {
  const [metadataOpen, setMetadataOpen] = useState(false);
  const basic = useCreateDaoStore((s) => s.basicInfo);
  const auction = useCreateDaoStore((s) => s.auction);
  const market = useCreateDaoStore((s) => s.marketplace);
  const governance = useCreateDaoStore((s) => s.governance);
  const preview = useCreateDaoStore((s) => s.imagePreview);
  const errors = useCreateDaoStore((s) => s.validationErrors);
  const update = useCreateDaoStore((s) => s.updateBasicInfo);
  const assets = creationAssets(configuredCreationNetwork());
  const assetName = (id: string) => assets.find((a) => a.contractId === id)?.code ?? id;
  const rows = [
    ['Name', [basic.tokenName, basic.tokenSymbol].filter(Boolean).join(' · ') || 'Not set yet'],
    ['About', basic.description || 'Not set yet'],
    ['Membership', membershipTypeOf(auction, market).title],
    ['Voting pace', votingPaceOf(governance)?.title ?? 'Custom'],
    [
      'Auctions',
      auction.enabled
        ? `On at launch. Each runs ${formatDuration(auction.duration, { style: 'long' })}, starting at ${auction.reservePrice} ${assetName(auction.paymentAsset)}. Late bids add ${formatDuration(auction.timeBuffer, { style: 'long' })}.`
        : 'Off at launch. You can turn them on later by vote.'
    ],
    [
      'Market',
      market.enabled
        ? `On at launch. Prices in ${assetName(market.paymentAsset)}, ${market.secondaryFeeBps / 100}% fee on resales.`
        : 'Off at launch.'
    ],
    [
      'Voting',
      `Opens ${formatDuration(governance.votingDelay, { style: 'long' })} after a proposal, stays open ${formatDuration(governance.votingPeriod, { style: 'long' })}.`
    ],
    [
      'Safety delay',
      `Passed proposals wait ${formatDuration(governance.queueDelay, { style: 'long' })} before they can run.`
    ],
    [
      'Rules',
      `${governance.quorumBps / 100}% of votes must take part. ${governance.proposalThreshold} ${governance.proposalThreshold === 1 ? 'vote' : 'votes'} needed to propose.`
    ],
    [
      'Launch admin',
      connectedAddress
        ? `${connectedAddress.slice(0, 4)}…${connectedAddress.slice(-4)} (you)`
        : 'Connect your wallet when ready'
    ],
    ['Image', preview ? 'A local preview only. Upload it, or use the saved image, before creating.' : 'Uploaded']
  ];
  return (
    <div className={styles.stack}>
      <dl className={styles.summary}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.muted}>
        Creating sets your community up in Setup, not live yet. There you add artwork and mint founder tokens. Launching
        is a separate step you sign when you&apos;re ready.
      </p>
      <details
        open={metadataOpen || Boolean(errors.tokenUri || errors.rendererBase)}
        onToggle={(event) => setMetadataOpen(event.currentTarget.open)}
      >
        <summary className={styles.label}>Advanced: metadata links</summary>
        <div className={styles.stack}>
          <CreationField id="tokenUri" label="Token metadata URL" hint="Use {daoId} for the predicted token address">
            <Input
              id="tokenUri"
              type="url"
              value={basic.tokenUri}
              {...fieldAccessibility('tokenUri', errors)}
              onChange={(e) => update({ tokenUri: e.target.value })}
            />
          </CreationField>
          <CreationField id="rendererBase" label="Renderer base URL">
            <Input
              id="rendererBase"
              type="url"
              value={basic.rendererBase}
              {...fieldAccessibility('rendererBase', errors)}
              onChange={(e) => update({ rendererBase: e.target.value })}
            />
          </CreationField>
        </div>
      </details>
    </div>
  );
}
