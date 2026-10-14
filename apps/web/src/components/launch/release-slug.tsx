'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { driveLinkReleasable, releaseSlugFailure } from '@/lib/launch-drive';
import { releaseDriveSlug } from '@/lib/release-slug';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const LABEL = 'Free the link';

/**
 * After a launch drive fails, its tribe keeps the link it reserved until someone frees it. Anyone can,
 * it moves no funds and costs only the network fee. Shown only while the indexed outcome is still
 * `open`: once the link is free it goes away.
 */
export function ReleaseSlug({ disabled = false }: { disabled?: boolean }) {
  const { daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const router = useRouter();
  const tx = useTransactionFeedback(config.name);
  const [now] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState(false);
  const [freed, setFreed] = useState(false);
  const lock = useRef(false);

  if (freed) return <Text color="ink.muted">The link is free again. The page catches up in a moment.</Text>;
  if (!driveLinkReleasable(config, now)) return null;

  const address = session.authStatus === 'authenticated' ? session.address : null;
  const canSign =
    Boolean(address) && !session.walletNetworkIssue && session.walletNetworkPassphrase === config.passphrase;

  async function release() {
    if (!address || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      tx.start(LABEL);
      tx.success('The link is free again', await releaseDriveSlug(config, address));
      setFreed(true);
      router.refresh();
    } catch (error) {
      const failure = releaseSlugFailure(error);
      tx.fail(failure.error, failure.title, 'manager');
      if (failure.freed) setFreed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={css({ display: 'grid', gap: '2', justifyItems: 'start' })}>
      <Text color="ink.muted">
        This tribe never launched, but it still holds the link it reserved. Anyone can free it for someone else to use.
        It costs only the network fee.
      </Text>
      <Button variant="secondary" disabled={disabled || !canSign} loading={busy} onClick={() => void release()}>
        {LABEL}
      </Button>
      {canSign ? null : <Text color="ink.muted">Connect a wallet on this tribe&apos;s network to free it.</Text>}
    </div>
  );
}
