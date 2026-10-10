'use client';

import { RefreshCw } from 'lucide-react';
import NextLink from 'next/link';
import { useState } from 'react';
import { css } from 'styled-system/css';

import {
  Address,
  Amount,
  Callout,
  Disclosure,
  EmptyState,
  IconButton,
  Pagination,
  Section,
  Skeleton
} from '@/components/ui';
import { card, muted, title } from '@/components/ui/panel-styles';
import { useDaoContext } from '@/contexts/dao-context';
import { findAsset } from '@/lib/assets-config';
import { decimalToStroops } from '@/lib/auction-values';
import { daoRoute } from '@/lib/dao-routes';
import { useTreasuryBalances } from '@/lib/treasury-queries';
import { clientTreasuryScope, useTreasuryHistory } from '@/lib/treasury-service/hooks';
import { displayTreasuryBalance } from '@/lib/treasury-service/values';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { FundTreasury } from './fund-treasury';
import { TransferProposal } from './transfer-proposal';
import { TreasuryTokens } from './treasury-tokens';

const layout = css({
  display: 'grid',
  gap: '8',
  lg: { gridTemplateColumns: 'minmax(0, 1fr) 380px', alignItems: 'start' }
});
const mainColumn = css({ display: 'grid', gap: '8', minW: '0' });
const sideColumn = css({ display: 'grid', gap: '5', minW: '0', lg: { position: 'sticky', top: '20' } });
const head = css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3' });
const assetRow = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  py: '3.5',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const assetIcon = css({
  display: 'grid',
  placeItems: 'center',
  width: '10',
  height: '10',
  borderRadius: 'full',
  bg: 'brass.wash',
  color: 'brass',
  fontFamily: 'display',
  fontWeight: '700'
});
const assetName = css({ textStyle: 'body', fontWeight: '600', m: '0' });
const assetBalance = css({
  textStyle: 'title',
  fontSize: { base: '1.125rem', md: '1.375rem' },
  m: '0',
  textAlign: 'right'
});
const historyList = css({ display: 'grid', listStyle: 'none', m: '0', p: '0' });
const historyItem = css({
  display: 'grid',
  gap: '2',
  py: '4',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' }
});
const link = css({ textStyle: 'label', color: 'signal', justifySelf: 'start' });

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
  const { daoId, daoConfig: config, routeId } = useDaoContext();
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
    <div className={layout}>
      <div className={mainColumn}>
        <section className={card} aria-labelledby="treasury-balances-title">
          <div className={head}>
            <div>
              <h2 id="treasury-balances-title" className={title}>
                What the community holds
              </h2>
              <p className={muted}>
                {funded === undefined ? 'Live balances' : `${funded} funded asset${funded === 1 ? '' : 's'}`}
              </p>
            </div>
            <IconButton label="Refresh treasury" variant="secondary" loading={refreshing} onClick={refresh}>
              {refreshing ? null : <RefreshCw aria-hidden="true" />}
            </IconButton>
          </div>
          {refreshError ? <Callout variant="warning" title={refreshError} role="alert" /> : null}
          {balances.error ? (
            <Callout
              variant="error"
              role="alert"
              title="Balances unavailable"
              description={`${balances.error.message}. We won't show a balance we couldn't read.`}
            />
          ) : null}
          {balances.isLoading && !balances.data ? (
            <div className={css({ display: 'grid', gap: '2' })} role="status" aria-busy="true">
              <span className="sr-only">Loading balances</span>
              <Skeleton className={css({ height: '14' })} />
              <Skeleton className={css({ height: '14' })} />
            </div>
          ) : null}
          {!config.treasuryContractId ? (
            <EmptyState title="No treasury">This community doesn&apos;t have a treasury set up.</EmptyState>
          ) : null}
          {knownBalances?.length ? (
            <div>
              {knownBalances.map((asset) => (
                <div className={assetRow} key={`${asset.assetCode}:${asset.assetIssuer || 'native'}`}>
                  <span className={assetIcon} aria-hidden="true">
                    {asset.assetCode.slice(0, 1)}
                  </span>
                  <div className={css({ minW: '0', flex: '1' })}>
                    <p className={assetName}>{findAsset(config.name, asset.assetCode)?.name ?? asset.assetCode}</p>
                    <p className={muted}>{asset.assetCode}</p>
                  </div>
                  <p className={assetBalance}>
                    <Amount value={displayTreasuryBalance(asset.balance)} unit={asset.assetCode} />
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {knownBalances?.length === 0 ? <p className={muted}>No assets are set up on this network.</p> : null}
          <Disclosure title="Technical details">
            {config.treasuryContractId ? <Address value={config.treasuryContractId} label="Treasury contract" /> : null}
            <p className={muted}>
              Balances are read live from the chain, exact to seven decimals. Payout history comes from the indexer and
              can lag a little. Contributions don&apos;t appear in payout history.
            </p>
          </Disclosure>
        </section>

        <TreasuryTokens />

        <Section title="Payouts" description="Money that left the treasury after a vote, newest first">
          {history.error ? (
            <Callout
              variant="error"
              role="alert"
              title="Execution history unavailable"
              description={history.error.message}
            />
          ) : null}
          {history.isLoading ? (
            <div className={css({ display: 'grid', gap: '2' })} role="status" aria-busy="true">
              <span className="sr-only">Loading payouts</span>
              <Skeleton className={css({ height: '16' })} />
            </div>
          ) : null}
          {history.data && !history.error ? (
            !history.data.calls.length ? (
              <EmptyState title={page === 0 ? 'No payouts yet' : 'Nothing more here'}>
                {page === 0 ? 'When members vote to spend treasury funds, each payout shows up here.' : undefined}
              </EmptyState>
            ) : (
              <ol className={historyList}>
                {history.data.calls.map((call) => (
                  <li key={call.eventId} className={historyItem}>
                    <div className={head}>
                      <p className={assetName}>
                        Step {call.index + 1}: {call.function}
                      </p>
                      <span className={muted}>
                        Ledger {call.ledger}
                        {call.at ? ` · ${new Date(call.at).toLocaleDateString()}` : ''}
                      </span>
                    </div>
                    <Address value={call.target} label="Contract" compact />
                    <Address value={call.transactionHash} label="Transaction" compact />
                    <NextLink href={daoRoute(routeId, `proposals/${call.proposalId}`)} className={link}>
                      View proposal
                    </NextLink>
                  </li>
                ))}
              </ol>
            )
          ) : null}
          <Pagination
            label="Treasury execution history pages"
            page={page + 1}
            hasPrevious={page > 0}
            hasNext={Boolean(history.data?.hasMore) && !history.error}
            onPrevious={() => setPage((current) => current - 1)}
            onNext={() => setPage((current) => current + 1)}
            disabled={history.isLoading}
          />
        </Section>
      </div>

      {config.treasuryContractId ? (
        <div className={sideColumn}>
          <FundTreasury key={`fund:${address}:${authStatus}`} scope={scope} onConfirmed={refresh} />
          <TransferProposal key={`transfer:${address}:${authStatus}`} />
        </div>
      ) : null}
    </div>
  );
}
