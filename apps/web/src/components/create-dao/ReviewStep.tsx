'use client';
import { useState } from 'react';

import { Disclosure, Input } from '@/components/ui';
import { membershipRulesOf, membershipTypeOf, votingPaceOf } from '@/lib/create-dao-presets';
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
  const claims = useCreateDaoStore((s) => s.claims);
  const tokenSettings = useCreateDaoStore((s) => s.tokenSettings);
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
    [
      'Who can hold one',
      membershipRulesOf(tokenSettings)?.description ??
        [
          tokenSettings.transfersLocked
            ? 'Memberships change hands only with DAO approval.'
            : 'Members can sell their tokens.',
          tokenSettings.membersOnlyDelegation ? 'Votes stay among members.' : 'Votes can be delegated to anyone.',
          tokenSettings.daoRecovery
            ? 'The DAO can move any membership by vote.'
            : 'Only a member moves their own token.'
        ].join(' ')
    ],
    ['Voting pace', votingPaceOf(governance)?.title ?? 'Custom'],
    [
      'Auctions',
      auction.enabled
        ? `On at launch. Each runs ${formatDuration(auction.duration, { style: 'long' })}, starting at ${auction.reservePrice} ${assetName(auction.paymentAsset)}. Late bids add ${formatDuration(auction.timeBuffer, { style: 'long' })}.`
        : 'None. A vote can add an auction later.'
    ],
    [
      'Market',
      market.enabled
        ? `On at launch. Prices in ${assetName(market.paymentAsset)}, ${market.secondaryFeeBps / 100}% fee on resales${tokenSettings.transfersLocked ? ' (resale stays closed while memberships are locked)' : ''}.`
        : 'None. A vote can add a market later.'
    ],
    [
      'Claim lists',
      claims.enabled
        ? `On. Listed people claim tokens from lists opened in Setup or by vote; paid lists are in ${assetName(auction.paymentAsset)}.`
        : auction.enabled || market.enabled
          ? 'None. A vote can add claim lists later.'
          : 'None, so only founder tokens exist until a vote adds a way to join.'
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
      <Disclosure
        title="Advanced: metadata links"
        open={metadataOpen || Boolean(errors.rendererBase)}
        onOpenChange={setMetadataOpen}
      >
        <div className={styles.stack}>
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
      </Disclosure>
    </div>
  );
}
