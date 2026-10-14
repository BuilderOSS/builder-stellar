'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useDeadlineClock } from '@/hooks/use-deadline-clock';
import { driveLinkReleasable, releaseSlugFailure } from '@/lib/launch-drive';
import { releaseDriveSlug } from '@/lib/release-slug';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const LABEL = 'Free the link';

type Feedback = Pick<ReturnType<typeof useTransactionFeedback>, 'start' | 'success' | 'fail'>;

/**
 * Free the link and report it. A link someone else freed first (7128) is the outcome we wanted, so it
 * counts as done: a success toast and `done()`, not an error. Every other failure stays an error.
 */
export async function freeDriveLink(release: () => Promise<string>, tx: Feedback, done: () => void) {
  try {
    tx.start(LABEL);
    tx.success('The link is free again', await release());
    done();
  } catch (error) {
    const failure = releaseSlugFailure(error);
    if (!failure.freed) {
      tx.fail(failure.error, failure.title, 'manager');
      return;
    }
    tx.success(failure.title, '', failure.error instanceof Error ? failure.error.message : undefined);
    done();
  }
}

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
  // Re-read when the deadline passes, so a page left open offers this without a reload.
  const now = useDeadlineClock(config.assuranceDeadline ?? null);
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
      await freeDriveLink(
        () => releaseDriveSlug(config, address),
        tx,
        () => {
          setFreed(true);
          router.refresh();
        }
      );
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
