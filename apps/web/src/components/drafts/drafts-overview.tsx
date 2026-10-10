'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { NewDraftButton, useLocalDrafts } from '@/components/local-workspace/local-drafts';
import { Callout, EmptyState, IconButton, Section, Skeleton } from '@/components/ui';
import { creationStorageError, useCreateDaoStore } from '@/stores/create-dao-store';

import { DraftRow } from './draft-row';
import { useAllDrafts } from './use-all-drafts';

const page = css({ display: 'grid', gap: '8' });
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

/** Every draft on this browser, split by what it will become. */
export function DraftsOverview() {
  const { items, hydrated, signedIn, discard } = useAllDrafts();
  const { scope } = useLocalDrafts();
  const [error, setError] = useState('');
  const proposals = items.filter((item) => item.kind === 'proposal');
  const daos = items.filter((item) => item.kind === 'dao');
  const storageError = error || creationStorageError();
  const safeDiscard: typeof discard = (item) => {
    try {
      discard(item);
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  if (!hydrated) return <Skeleton className={css({ height: '32', borderRadius: 'card' })} />;

  return (
    <div className={page}>
      {storageError ? <Callout variant="error" title="Drafts need attention" description={storageError} /> : null}

      <Section title="Proposals in progress" description="Saved per wallet, for each community.">
        {!signedIn ? (
          <p className={note}>Connect your wallet to see your proposal drafts.</p>
        ) : proposals.length ? (
          <div>
            {proposals.map((item) => (
              <DraftRow key={item.id} item={item} onDiscard={safeDiscard} />
            ))}
          </div>
        ) : (
          <p className={note}>No proposal drafts. Start one from a community&apos;s Proposals page.</p>
        )}
      </Section>

      <Section
        title="DAOs you're starting"
        description="You don't need a wallet until you create one."
        action={<NewDraftButton hydrated={hydrated} scope={scope} />}
      >
        {daos.length ? (
          <div>
            {daos.map((item) => (
              <DraftRow
                key={item.id}
                item={item}
                onDiscard={safeDiscard}
                extra={
                  <IconButton
                    label={`Duplicate ${item.title}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      try {
                        useCreateDaoStore.getState().duplicateDraft(item.id);
                      } catch (failure) {
                        setError((failure as Error).message);
                      }
                    }}
                  >
                    <Copy aria-hidden="true" />
                  </IconButton>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No DAO drafts">When you start a DAO, it saves here as you go.</EmptyState>
        )}
      </Section>
    </div>
  );
}
