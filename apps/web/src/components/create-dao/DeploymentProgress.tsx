'use client';
import { Callout } from '@/components/ui';
import type { CreationNetwork } from '@/lib/create-dao-schema';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import type { DeploymentState } from '@/lib/use-dao-deployment';
import type { DeploymentRecord } from '@/stores/create-dao-store';

import styles from './workspace.module.css';

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
    idle: 'Saved deployment',
    predicting: 'Predicting addresses…',
    creating: 'Review the creation transaction in your wallet',
    confirming: 'Checking on-chain confirmation…',
    complete: 'Created in Setup',
    error: 'Deployment needs attention'
  };
  return (
    <section className={styles.panel} aria-label="Deployment recovery">
      <h2>{confirmed ? 'Created in Setup' : labels[state.currentStep]}</h2>
      <p className={styles.muted} role="status">
        {confirmed
          ? record.confirmedBy === 'manager-state'
            ? 'The pending DAO is verified on this Manager. The saved transaction status may be unavailable. Complete Setup before Launch.'
            : 'Contracts are deployed. Mint founder tokens and complete Setup before Launch.'
          : record.hash
            ? record.status === 'signed'
              ? 'Signed envelope saved. RPC acceptance is not confirmed. Check its hash or explicitly rebroadcast these same bytes while valid.'
              : ['rejected', 'expired', 'failed'].includes(record.status)
                ? 'This attempt was rejected, expired, or failed. Explicit retry checks Manager state and reuses the frozen configuration and nonce.'
                : record.acceptedAt
                  ? 'RPC accepted this envelope. Check its confirmation or explicitly rebroadcast the same bytes; no new transaction will be signed.'
                  : 'This older receipt records a transaction hash but not proven RPC acceptance. Check its transaction or Manager state before any retry.'
            : 'The nonce and configuration are saved. Retrying uses the same addresses.'}
      </p>
      {state.error || record.error ? (
        <Callout variant="error" title="Needs attention" description={state.error?.message || record.error || ''} />
      ) : null}
      <dl className={styles.summary}>
        <div>
          <dt>Nonce</dt>
          <dd className={styles.code}>{record.nonce}</dd>
        </div>
        <div>
          <dt>Deployer</dt>
          <dd className={styles.code}>{record.deployer}</dd>
        </div>
        {record.hash ? (
          <div>
            <dt>Transaction</dt>
            <dd>
              <a className={styles.code} href={getExplorerTxUrl(network, record.hash)} target="_blank" rel="noreferrer">
                {record.hash}
              </a>
            </dd>
          </div>
        ) : null}
        {record.addresses
          ? Object.entries(record.addresses).map(([name, address]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd className={styles.code}>{address}</dd>
              </div>
            ))
          : null}
      </dl>
    </section>
  );
}
