'use client';

import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { Route } from 'next';
import { css } from 'styled-system/css';

import { Button, ButtonLink, Callout } from '@/components/ui';
import type { DaoNetworkName } from '@/lib/dao-config';
import { getExplorerTxUrl } from '@/lib/explorer-links';

const actions = css({ display: 'flex', flexWrap: 'wrap', gap: '2', mt: '2' });

/** A sent transaction whose outcome the page has not seen yet, and what it was for. */
export type PendingConfirmation = {
  hash: string;
  /** The subject of the sentence, for example "Your vote". */
  subject: string;
};

/**
 * Sent, but not confirmed within the wait. A recovery state, not a failure (DESIGN.md, Voice):
 * the transaction may still land, so the person checks it, and can check again here, before they
 * try the same action twice.
 */
export function UnconfirmedTransaction({
  network,
  pending,
  checking,
  onCheck
}: {
  network: DaoNetworkName;
  pending: PendingConfirmation;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <Callout
      variant="info"
      role="status"
      title="Waiting for confirmation…"
      description={`${pending.subject} was sent, but the network hasn't confirmed it yet. Check the transaction before you try again.`}
    >
      <div className={actions}>
        <ButtonLink href={getExplorerTxUrl(network, pending.hash) as Route} external variant="secondary" size="sm">
          Check the transaction
          <ArrowUpRight aria-hidden="true" />
        </ButtonLink>
        <Button variant="ghost" size="sm" loading={checking} onClick={onCheck}>
          {checking ? null : <RefreshCw aria-hidden="true" />}
          Check again
        </Button>
      </div>
    </Callout>
  );
}
