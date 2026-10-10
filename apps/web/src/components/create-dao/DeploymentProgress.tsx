'use client';
import { css } from 'styled-system/css';

import { Address, Callout, Disclosure } from '@/components/ui';
import type { CreationNetwork } from '@/lib/create-dao-schema';
import type { DeploymentState } from '@/lib/use-dao-deployment';
import type { DeploymentRecord } from '@/stores/create-dao-store';

import styles from './workspace-styles';

const titleClass = css({ textStyle: 'title', fontSize: '1.375rem', m: '0' });

export function DeploymentProgress({
  state,
  record,
  network
}: {
  state: DeploymentState;
  record: DeploymentRecord;
  network: CreationNetwork;
}) {
  const confirmed = record.status === 'confirmed';
  const labels = {
    idle: 'Saved, not created yet',
    predicting: 'Preparing…',
    creating: 'Approve it in your wallet',
    confirming: 'Confirming on the network…',
    complete: 'Created. Next, set it up',
    error: 'This needs attention'
  };
  return (
    <section className={styles.panel} aria-label="Creating your community">
      <h2 className={titleClass}>{confirmed ? 'Created. Next, set it up' : labels[state.currentStep]}</h2>
      <p className={styles.muted} role="status">
        {confirmed
          ? record.confirmedBy === 'manager-state'
            ? 'Your community exists on the network (we could not read the transaction itself). Finish Setup, then launch.'
            : 'Your community is created in Setup. Next: upload artwork, mint founder tokens, then launch.'
          : record.hash
            ? record.status === 'signed'
              ? "Your wallet signed it, but the network hasn't confirmed receiving it. Check it, or send the same signed transaction again while it's still valid."
              : ['rejected', 'expired', 'failed'].includes(record.status)
                ? "That attempt didn't go through. Trying again checks the network first and reuses the same settings, so nothing is created twice."
                : record.acceptedAt
                  ? 'The network received it. Check for confirmation, or send the same signed transaction again. Nothing new is signed.'
                  : "We have this transaction's hash but no proof the network received it. Check it before trying again."
            : 'Your settings are saved. Trying again uses the same addresses.'}
      </p>
      {state.error || record.error ? (
        <Callout
          variant="error"
          title="This needs attention"
          description={state.error?.message || record.error || ''}
        />
      ) : null}
      <Disclosure title="Technical details">
        {record.hash ? <Address value={record.hash} label="Transaction" /> : null}
        <Address value={record.deployer} label="Created by" />
        <dl className={styles.summary}>
          <div>
            <dt>Nonce</dt>
            <dd className={styles.code}>{record.nonce}</dd>
          </div>
        </dl>
        {record.addresses
          ? Object.entries(record.addresses).map(([name, address]) => (
              <Address key={name} value={address} label={name} compact />
            ))
          : null}
        <p className={styles.muted}>Network: {network}</p>
      </Disclosure>
    </section>
  );
}
