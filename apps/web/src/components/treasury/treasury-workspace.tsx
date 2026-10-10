'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useDaoContext } from '@/contexts/dao-context';
import { findAsset } from '@/lib/assets-config';
import { decimalToStroops } from '@/lib/auction-values';
import { daoRoute } from '@/lib/dao-routes';
import { getExplorerTxUrl } from '@/lib/explorer-links';
import { useTreasuryBalances } from '@/lib/treasury-queries';
import { clientTreasuryScope, useTreasuryHistory } from '@/lib/treasury-service/hooks';
import { displayTreasuryBalance } from '@/lib/treasury-service/values';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { FundTreasury } from './fund-treasury';
import { TransferProposal } from './transfer-proposal';
import styles from './treasury.module.css';

export function TreasuryWorkspace() {
  const { daoId, daoConfig: config } = useDaoContext();
  // Remount scoped state (page, reviews and pending hashes) rather than carrying it into another DAO.
  return (
    <ScopedTreasuryWorkspace
      key={`${daoId}:${config.name}:${config.treasuryContractId}:${config.governorContractId}`}
    />
  );
}

function ScopedTreasuryWorkspace() {
  const { daoId, daoConfig: config } = useDaoContext();
  const [page, setPage] = useState(0);
  const [refreshError, setRefreshError] = useState('');
  const balances = useTreasuryBalances(config);
  const scope = clientTreasuryScope(daoId, config);
  const history = useTreasuryHistory(scope, page);
  const address = useAuthSessionStore((s) => s.address);
  const authStatus = useAuthSessionStore((s) => s.authStatus);
  const knownBalances = balances.error ? undefined : balances.data;
  const funded = knownBalances?.filter((asset) => (decimalToStroops(asset.balance) ?? -1n) > 0n).length;
  const refreshing = balances.isValidating || history.isValidating;
  function refresh() {
    setRefreshError('');
    void Promise.all([balances.mutate(), history.mutate()]).catch(() =>
      setRefreshError('Some treasury reads could not be refreshed. Previous data may be stale.')
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.columns}>
        <section className={`${styles.panel} ${styles.stack}`} aria-labelledby="treasury-balances-title">
          <div className={styles.row}>
            <div>
              <p className={styles.label}>
                Contract-held assets · {config.name === 'public' ? 'Mainnet' : config.name}
              </p>
              <h2 id="treasury-balances-title">
                {funded === undefined ? 'Asset balances' : `${funded} funded asset${funded === 1 ? '' : 's'}`}
              </h2>
            </div>
            <button type="button" disabled={refreshing} onClick={refresh}>
              {refreshing ? 'Refreshing…' : 'Refresh treasury'}
            </button>
          </div>
          <div className={styles.notice}>
            <p className={styles.label}>Treasury contract</p>
            <p className={styles.address}>{config.treasuryContractId || 'Treasury not configured'}</p>
          </div>
          <p className={styles.muted}>
            Balances are live SAC reads, shown exactly to seven decimal places. Execution history is indexed separately
            and may lag. Contributions are not part of this execution-only history.
          </p>
          {refreshError ? (
            <p role="alert" className={styles.error}>
              {refreshError}
            </p>
          ) : null}
          {balances.error ? (
            <p role="alert" className={styles.error}>
              Balances unavailable: {balances.error.message}. No zero balance is inferred.
            </p>
          ) : null}
          {balances.isLoading && !balances.data ? (
            <p role="status" aria-busy="true">
              Loading treasury balances…
            </p>
          ) : null}
          {!config.treasuryContractId ? <p role="status">This community has no configured treasury.</p> : null}
          {knownBalances?.map((asset) => (
            <div className={styles.asset} key={`${asset.assetCode}:${asset.assetIssuer || 'native'}`}>
              <div>
                <h3>{findAsset(config.name, asset.assetCode)?.name ?? asset.assetCode}</h3>
                <p className={styles.muted}>
                  {asset.assetCode}
                  {asset.isNative ? ' · native SAC' : ''}
                </p>
              </div>
              <p className={styles.balance}>
                {displayTreasuryBalance(asset.balance)} <span className={styles.muted}>{asset.assetCode}</span>
              </p>
            </div>
          ))}
          {knownBalances?.length === 0 ? (
            <p role="status">No configured assets are available for this network.</p>
          ) : null}
        </section>
        <div className={styles.stack}>
          {config.treasuryContractId ? (
            <FundTreasury key={`${address}:${authStatus}`} scope={scope} onConfirmed={refresh} />
          ) : null}
          {config.treasuryContractId ? <TransferProposal key={`${address}:${authStatus}`} /> : null}
        </div>
      </div>
      <section className={`${styles.panel} ${styles.stack}`} aria-labelledby="treasury-history-title">
        <div className={styles.row}>
          <div>
            <p className={styles.label}>Execution receipts</p>
            <h2 id="treasury-history-title">Treasury execution history</h2>
          </div>
          <p className={styles.muted}>Newest calls first · Page {page + 1}</p>
        </div>
        {history.error ? (
          <p role="alert" className={styles.error}>
            Execution history unavailable: {history.error.message}
          </p>
        ) : null}
        {history.isLoading ? (
          <p role="status" aria-busy="true">
            Loading scoped execution receipts…
          </p>
        ) : null}
        {history.data && !history.error ? (
          <>
            {!history.data.calls.length ? (
              <p role="status">
                {page === 0 ? 'No indexed treasury executions yet.' : 'No more executions on this page.'}
              </p>
            ) : (
              <ol className={styles.history}>
                {history.data.calls.map((call) => (
                  <li key={call.eventId}>
                    <div className={styles.row}>
                      <h3>
                        Call {call.index + 1} · {call.function}
                      </h3>
                      <p className={styles.muted}>
                        Ledger {call.ledger}
                        {call.at ? ` · ${new Date(call.at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <p className={styles.address}>Target: {call.target}</p>
                    <div className={styles.row}>
                      <Link href={daoRoute(daoId, `proposals/${call.proposalId}`)}>
                        Proposal & full execution receipt ↗
                      </Link>
                      {config.name !== 'local' ? (
                        <a href={getExplorerTxUrl(config.name, call.transactionHash)} target="_blank" rel="noreferrer">
                          Transaction ↗
                        </a>
                      ) : null}
                    </div>
                    <p className={styles.address}>Transaction: {call.transactionHash}</p>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
        <nav className={styles.row} aria-label="Treasury execution history pages">
          <button
            type="button"
            disabled={page === 0 || history.isLoading}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!history.data?.hasMore || Boolean(history.error) || history.isLoading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      </section>
    </div>
  );
}
