'use client';

import { RefreshCw } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { DaoContractList } from '@/components/dao-contract-list';
import {
  Amount,
  Avatar,
  Button,
  Callout,
  ListRow,
  SearchInput,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text
} from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { shortAddress } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
import { useGoldskyMemberList } from '@/lib/goldsky-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';

import { ProposalStateBadge } from './proposal-state-badge';
import type { ProposalListResponse } from './types';

type ContextTab = 'treasury' | 'members' | 'contracts' | 'history';

type ProposalContextRailProps = {
  activeActionType?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Kept for API compatibility; the Sheet returns focus itself. */
  mobileTriggerRef?: React.RefObject<HTMLButtonElement | null>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(json.message || 'Request failed');
  return json;
}

function formatNumber(value: string | number) {
  try {
    return new Intl.NumberFormat().format(typeof value === 'number' ? value : BigInt(value));
  } catch {
    return String(value);
  }
}

function formatBalance(balance: string) {
  const value = Number(balance);
  if (!Number.isFinite(value)) return balance;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

const panel = css({ display: 'grid', gap: '3' });
const intro = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const loadingRows = css({ display: 'grid', gap: '2.5' });

function DataState({
  loading,
  error,
  hasData,
  children
}: {
  loading: boolean;
  error?: Error;
  hasData: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className={loadingRows} role="status" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className={css({ height: '10' })} />
        <Skeleton className={css({ height: '10' })} />
        <Skeleton className={css({ height: '10' })} />
      </div>
    );
  }
  if (error && !hasData) return <Callout variant="error" title="This didn't load" description={error.message} />;
  return (
    <>
      {error ? <Callout variant="warning" title="This may be out of date" description={error.message} /> : null}
      {children}
    </>
  );
}

function TreasuryPanel({ config }: { config: Parameters<typeof useTreasuryBalances>[0] }) {
  const { data: balances, error, isLoading } = useTreasuryBalances(config);
  return (
    <div className={panel}>
      <p className={intro}>What the treasury holds right now. Check before proposing a transfer.</p>
      <DataState loading={isLoading && !balances} error={error} hasData={Boolean(balances)}>
        {balances?.length ? (
          <div>
            {balances.map((asset) => (
              <ListRow
                key={`${asset.assetCode}-${asset.assetIssuer ?? 'native'}`}
                title={asset.assetCode}
                trailing={<Amount value={formatBalance(asset.balance)} />}
              />
            ))}
          </div>
        ) : (
          <Text size="sm">No assets are set up for this treasury.</Text>
        )}
      </DataState>
    </div>
  );
}

function MemberPanel({ daoTokenAddress }: { daoTokenAddress: string }) {
  const [query, setQuery] = useState('');
  const { data, error, isLoading, mutate } = useGoldskyMemberList(daoTokenAddress, 100);
  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (data?.items ?? []).filter(
        (member) => !normalizedQuery || member.address.toLowerCase().includes(normalizedQuery)
      ),
    [data?.items, normalizedQuery]
  );
  return (
    <div className={panel}>
      <p className={intro}>Find a recipient or check someone&apos;s voting power.</p>
      <SearchInput label="Search members" placeholder="Search by address" value={query} onValueChange={setQuery} />
      <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2' })}>
        <span className={intro}>{data ? `${data.total} members` : 'Members'}</span>
        <Button variant="ghost" size="sm" onClick={() => void mutate()} loading={isLoading}>
          {isLoading ? null : <RefreshCw aria-hidden="true" />}
          Refresh
        </Button>
      </div>
      <DataState loading={isLoading && !data} error={error} hasData={Boolean(data)}>
        {rows.length ? (
          <div>
            {rows.slice(0, 12).map((member) => (
              <ListRow
                key={member.address}
                media={<Avatar address={member.address} size="sm" />}
                title={<span title={member.address}>{shortAddress(member.address)}</span>}
                meta={`${formatNumber(member.voting_power)} votes`}
              />
            ))}
            {rows.length > 12 ? <p className={intro}>Showing the first 12 matches.</p> : null}
          </div>
        ) : (
          <Text size="sm">No members match that address.</Text>
        )}
      </DataState>
    </div>
  );
}

function HistoryPanel({ daoId }: { daoId: string }) {
  const { data, error, isLoading } = useSWR<ProposalListResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/proposals?limit=8`,
    fetchJson,
    { keepPreviousData: true }
  );
  return (
    <div className={panel}>
      <p className={intro}>How this community decided similar things before.</p>
      <DataState loading={isLoading && !data} error={error} hasData={Boolean(data)}>
        {data?.items.length ? (
          <div>
            {data.items.map((proposal) => (
              <ListRow
                key={proposal.proposalId}
                href={daoRoute(daoId, `proposals/${proposal.proposalNumber}`)}
                title={proposal.metadata.title || 'Untitled proposal'}
                meta={`#${proposal.proposalNumber}`}
                trailing={<ProposalStateBadge label={proposal.stateLabel} />}
              />
            ))}
          </div>
        ) : (
          <Text size="sm">No proposals yet. This could be the first decision.</Text>
        )}
      </DataState>
    </div>
  );
}

function ContextContent({ activeActionType }: { activeActionType?: string }) {
  const { daoId, daoTokenAddress, daoConfig: config } = useDaoContext();
  const [tab, setTab] = useState<ContextTab>(activeActionType?.includes('transfer') ? 'treasury' : 'members');
  return (
    <div className={css({ display: 'grid', gap: '4' })}>
      <SegmentedControl
        label="Context"
        value={tab}
        onValueChange={(value) => setTab(value as ContextTab)}
        options={[
          { value: 'treasury', label: 'Treasury' },
          { value: 'members', label: 'Members' },
          { value: 'history', label: 'History' },
          { value: 'contracts', label: 'Contracts' }
        ]}
      />
      {tab === 'treasury' ? <TreasuryPanel config={config} /> : null}
      {tab === 'members' ? <MemberPanel daoTokenAddress={daoTokenAddress} /> : null}
      {tab === 'history' ? <HistoryPanel daoId={daoId} /> : null}
      {tab === 'contracts' ? <DaoContractList config={config} compact /> : null}
    </div>
  );
}

const desktopRail = css({
  display: { base: 'none', lg: 'grid' },
  alignContent: 'start',
  gap: '4',
  position: 'sticky',
  top: '20',
  maxH: 'calc(100dvh - 104px)',
  overflowY: 'auto',
  p: '5',
  borderRadius: 'card',
  bg: 'surface',
  boxShadow: 'raised'
});
const railTitle = css({ textStyle: 'heading', fontSize: '1.0625rem', m: '0' });

/**
 * Reference while drafting: treasury, members, past votes, contracts.
 * Side panel on wide screens, a sheet on phones.
 */
export function ProposalContextRail({ activeActionType, mobileOpen, onMobileClose }: ProposalContextRailProps) {
  return (
    <>
      <aside className={desktopRail} aria-labelledby="proposal-context-title">
        <h2 id="proposal-context-title" className={railTitle}>
          For reference
        </h2>
        <ContextContent activeActionType={activeActionType} />
      </aside>
      <Sheet
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) onMobileClose();
        }}
        title="For reference"
        description="Treasury, members and past votes"
      >
        <ContextContent activeActionType={activeActionType} />
      </Sheet>
    </>
  );
}
