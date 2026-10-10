'use client';
import { useState } from 'react';

import { Input } from '@/components/ui';
import { configuredCreationNetwork, creationAssets } from '@/lib/create-dao-schema';
import { formatDuration } from '@/lib/duration';
import { useCreateDaoStore } from '@/stores/create-dao-store';

import { CreationField, fieldAccessibility } from './CreationField';
import styles from './workspace.module.css';

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
    ['Identity', `${basic.tokenName} · ${basic.tokenSymbol}`],
    ['Description', basic.description],
    [
      'Auctions',
      `${auction.enabled ? 'Selected for launch' : 'Disabled at launch'} · ${auction.reservePrice} ${assetName(auction.paymentAsset)} reserve`
    ],
    ['Auction timing', `${formatDuration(auction.duration)} · ${auction.timeBuffer}s extension`],
    [
      'Marketplace',
      `${market.enabled ? 'Selected for launch' : 'Disabled at launch'} · ${assetName(market.paymentAsset)} · ${market.secondaryFeeBps / 100}% fee`
    ],
    ['Voting', `${formatDuration(governance.votingDelay)} delay · ${formatDuration(governance.votingPeriod)} voting`],
    ['Execution queue', formatDuration(governance.queueDelay)],
    ['Requirements', `${governance.quorumBps / 100}% quorum · ${governance.proposalThreshold} votes to propose`],
    ['Launch admin', connectedAddress || 'Connect your wallet when ready'],
    ['Image', preview ? 'Local preview only. Upload it or use the saved image before deployment.' : basic.contractImage]
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
        Create deploys contracts in Setup, not a live DAO. Configure artwork and mint founder tokens there. Launch is a
        separate, signed action.
      </p>
      <details
        open={metadataOpen || Boolean(errors.tokenUri || errors.rendererBase)}
        onToggle={(event) => setMetadataOpen(event.currentTarget.open)}
      >
        <summary>Metadata URLs</summary>
        <div className={styles.stack} style={{ marginTop: 16 }}>
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
