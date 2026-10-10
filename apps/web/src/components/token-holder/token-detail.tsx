'use client';

import Image from 'next/image';
import Link from 'next/link';
import useSWR from 'swr';

import styles from '@/components/member-directory/directory.module.css';
import { PageSection } from '@/components/page-section';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { directoryFetch } from '@/lib/member-directory/hooks';
import { validHolderAddress } from '@/lib/token-holder/read';
import type { HolderDetail } from '@/lib/token-holder/types';

import { HolderControls } from './holder-controls';

export function HolderTokenDetail({ tokenId }: { tokenId: number }) {
  const { daoId, daoConfig: config } = useDaoContext();
  const { data, error, isLoading, isValidating, mutate } = useSWR(['token-holder', DEPLOYMENT_ID, daoId, tokenId], () =>
    directoryFetch<HolderDetail>(`/api/dao/${encodeURIComponent(daoId)}/tokens/${tokenId}`)
  );
  const title = data?.metadata?.name || `${config.tokenName || 'Token'} #${tokenId}`;
  const owner = !error ? validHolderAddress(data?.owner) : null;
  const indexedOwner = validHolderAddress(data?.indexedOwner);
  return (
    <PageSection
      title={title}
      description={config.tokenDescription || 'Ownership, artwork and holder controls for this DAO token.'}
    >
      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.row}>
            <Link href={`/dao/${daoId}`}>← {config.tokenName || 'DAO'}</Link>
            <button type="button" disabled={isValidating} onClick={() => void mutate()}>
              {isValidating ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {isLoading ? <p role="status">Loading token details…</p> : null}
          {error ? <p role="alert">{error.message}</p> : null}
          {owner ? (
            <Image
              src={`/api/render/${encodeURIComponent(daoId)}/${tokenId}`}
              alt={`Artwork for ${title}`}
              width={512}
              height={512}
              unoptimized
              style={{ width: '100%', height: 'auto', borderRadius: 10 }}
            />
          ) : null}
          {data?.metadataIssue ? <p role="status">{data.metadataIssue}</p> : null}
          <h2>Token #{tokenId}</h2>
          <p>{data?.metadata?.description || config.tokenDescription || 'No description available.'}</p>
          {data?.metadata?.attributes.length ? (
            <dl className={styles.stats}>
              {data.metadata.attributes.map((trait, index) => (
                <div key={`${trait.trait_type}:${index}`}>
                  <dt>{trait.trait_type}</dt>
                  <dd style={{ fontSize: 16 }}>{trait.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <Link href={`/api/dao/${encodeURIComponent(daoId)}/token/${tokenId}`}>View JSON metadata ↗</Link>
        </section>
        <div>
          <section className={styles.panel}>
            <h2>Current holder</h2>
            {owner ? (
              <>
                <Link className={styles.address} href={`/dao/${daoId}/members/${owner}`}>
                  {owner}
                </Link>
                <p className={styles.muted}>
                  {data?.ownerSource === 'onchain'
                    ? 'Read from the token contract.'
                    : 'Indexed owner only. The chain could not be read; holder controls are unavailable.'}
                </p>
                {indexedOwner && indexedOwner !== owner ? (
                  <p>Indexed ownership is still catching up with the chain.</p>
                ) : null}
              </>
            ) : (
              <p>
                {isLoading
                  ? 'Checking ownership…'
                  : 'Ownership is unavailable. The token may not exist yet, or the data source is offline.'}
              </p>
            )}
            <p>
              One token provides one voting unit. Its holder’s delegated voting power may differ from their token count.
            </p>
          </section>
          <HolderControls
            key={`${daoId}:${tokenId}`}
            tokenId={tokenId}
            owner={owner}
            liveOwner={Boolean(owner) && data?.ownerSource === 'onchain'}
            onRefresh={() => void mutate()}
          />
        </div>
      </div>
    </PageSection>
  );
}
