'use client';

import { ArrowUpRight, ChevronLeft, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { PageSection } from '@/components/page-section';
import { Avatar, ButtonLink, Callout, Chip, IconButton, Skeleton } from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { shortAddress } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
import { directoryFetch } from '@/lib/member-directory/hooks';
import { validHolderAddress } from '@/lib/token-holder/read';
import type { HolderDetail } from '@/lib/token-holder/types';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { HolderControls } from './holder-controls';

const layout = css({
  display: 'grid',
  gap: '8',
  md: { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }
});
const art = css({
  aspectRatio: '1',
  borderRadius: 'sheet',
  overflow: 'hidden',
  bg: 'hover',
  outline: '1px solid',
  outlineColor: 'imageEdge',
  outlineOffset: '-1px',
  md: { position: 'sticky', top: '20' },
  '& img': { width: '100%', height: '100%', objectFit: 'cover' }
});
const side = css({ display: 'grid', gap: '5', minW: '0' });
const traits = css({ display: 'flex', flexWrap: 'wrap', gap: '2', m: '0' });
const trait = css({ display: 'grid', gap: '0.5', px: '3', py: '2', borderRadius: 'control', bg: 'hover' });
const traitName = css({ textStyle: 'micro', color: 'ink.muted' });
const traitValue = css({ textStyle: 'label', color: 'ink', m: '0' });
const ownerRow = css({ display: 'flex', alignItems: 'center', gap: '3', textDecoration: 'none', color: 'ink' });
const ownerName = css({ textStyle: 'subheading', m: '0' });
const link = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  textStyle: 'label',
  color: 'signal',
  '& svg': { width: '4', height: '4' }
});
const back = css({ justifySelf: 'start', ml: '-3', mb: '2' });

export function HolderTokenDetail({ tokenId }: { tokenId: number }) {
  const { daoId, daoConfig: config } = useDaoContext();
  const viewer = useAuthSessionStore((state) => state.address);
  const { data, error, isLoading, isValidating, mutate } = useSWR(['token-holder', DEPLOYMENT_ID, daoId, tokenId], () =>
    directoryFetch<HolderDetail>(`/api/dao/${encodeURIComponent(daoId)}/tokens/${tokenId}`)
  );
  const name = data?.metadata?.name || `${config.tokenName || 'Token'} #${tokenId}`;
  const owner = !error ? validHolderAddress(data?.owner) : null;
  const indexedOwner = validHolderAddress(data?.indexedOwner);

  return (
    <div>
      <ButtonLink href={daoRoute(daoId)} variant="ghost" size="sm" className={back}>
        <ChevronLeft aria-hidden="true" />
        {config.tokenName || 'Community'}
      </ButtonLink>
      <PageSection title={name} description={data?.metadata?.description || config.tokenDescription || undefined}>
        <div className={layout}>
          <div className={art}>
            {owner ? (
              <Image
                src={`/api/render/${encodeURIComponent(daoId)}/${tokenId}`}
                alt={`Artwork for ${name}`}
                width={640}
                height={640}
                unoptimized
                priority
              />
            ) : isLoading ? (
              <Skeleton className={css({ width: '100%', height: '100%' })} />
            ) : null}
          </div>

          <div className={side}>
            {error ? <Callout variant="error" title="This token didn't load" description={error.message} /> : null}
            {data?.metadataIssue ? <Callout variant="warning" title={data.metadataIssue} /> : null}

            <section className={card} aria-labelledby="token-holder-title">
              <div
                className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '3' })}
              >
                <h2 id="token-holder-title" className={title}>
                  Held by
                </h2>
                <IconButton
                  label="Refresh token"
                  variant="secondary"
                  size="sm"
                  loading={isValidating}
                  onClick={() => void mutate()}
                >
                  {isValidating ? null : <RefreshCw aria-hidden="true" />}
                </IconButton>
              </div>
              {owner ? (
                <>
                  <NextLink href={daoRoute(daoId, `members/${owner}`)} className={ownerRow} title={owner}>
                    <Avatar address={owner} size="lg" yours={owner === viewer} />
                    <div>
                      <p className={ownerName}>{owner === viewer ? 'You' : shortAddress(owner)}</p>
                      <p className={muted}>
                        {data?.ownerSource === 'onchain'
                          ? 'Read live from the token contract'
                          : 'From the indexer only; actions are paused until the chain can be read'}
                      </p>
                    </div>
                    {owner === viewer ? <Chip tone="yours">Yours</Chip> : null}
                  </NextLink>
                  {indexedOwner && indexedOwner !== owner ? (
                    <p className={muted}>The indexer is still catching up with this ownership change.</p>
                  ) : null}
                </>
              ) : (
                <p className={muted}>
                  {isLoading
                    ? 'Checking who holds it…'
                    : 'Ownership is unavailable. The token may not exist yet, or the data source is offline.'}
                </p>
              )}
              <p className={muted}>
                Each token is one vote. Holders can delegate that vote without giving up the token.
              </p>
            </section>

            {data?.metadata?.attributes.length ? (
              <section aria-label="Traits">
                <dl className={traits}>
                  {data.metadata.attributes.map((item, index) => (
                    <div key={`${item.trait_type}:${index}`} className={trait}>
                      <dt className={traitName}>{item.trait_type}</dt>
                      <dd className={traitValue}>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            <HolderControls
              key={`${daoId}:${tokenId}`}
              tokenId={tokenId}
              owner={owner}
              liveOwner={Boolean(owner) && data?.ownerSource === 'onchain'}
              onRefresh={() => void mutate()}
            />

            <a href={`/api/dao/${encodeURIComponent(daoId)}/token/${tokenId}`} className={link}>
              View raw metadata
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </PageSection>
    </div>
  );
}
