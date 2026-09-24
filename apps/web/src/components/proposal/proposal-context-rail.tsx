'use client';

import { Copy, ExternalLink, RefreshCw, Search, WalletCards, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { Badge, Button, Callout, Card, Input, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useGoldskyMemberList } from '@/lib/goldsky-queries';
import type { AssetBalance } from '@/lib/treasury-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';

import type { ProposalListResponse } from './types';

type ContextTab = 'snapshot' | 'treasury' | 'members' | 'history';

type ProposalContextRailProps = {
  activeActionType?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

const tabs: Array<{ id: ContextTab; label: string; shortLabel: string }> = [
  { id: 'snapshot', label: 'Snapshot', shortLabel: 'Overview' },
  { id: 'treasury', label: 'Treasury', shortLabel: 'Treasury' },
  { id: 'members', label: 'Members', shortLabel: 'Members' },
  { id: 'history', label: 'Past proposals', shortLabel: 'History' }
];

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

function formatDate(timestamp: number) {
  if (!timestamp) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp * 1000));
}

function DataState({ loading, error, children }: { loading: boolean; error?: Error; children: React.ReactNode }) {
  if (loading) {
    return (
      <div className="proposal-context-loading" role="status" aria-busy="true">
        <Skeleton style={{ width: '75%', height: '0.85rem' }} />
        <Skeleton style={{ width: '52%', height: '0.85rem' }} />
        <Skeleton style={{ width: '64%', height: '0.85rem' }} />
      </div>
    );
  }
  if (error) return <Callout variant="error" title="Data unavailable" description={error.message} />;
  return children;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="proposal-context-metric">
      <Text className="label">{label}</Text>
      <strong>{value}</strong>
      {detail ? <Text className="proposal-context-detail">{detail}</Text> : null}
    </div>
  );
}

function TreasuryPanel({ balances, loading, error }: { balances?: AssetBalance[]; loading: boolean; error?: Error }) {
  return (
    <DataState loading={loading} error={error}>
      <div className="proposal-context-list">
        {balances?.length ? (
          balances.map((asset) => (
            <div className="proposal-context-row" key={`${asset.assetCode}-${asset.assetIssuer ?? 'native'}`}>
              <div>
                <strong>{asset.assetCode}</strong>
                <Text className="proposal-context-detail">Available in treasury</Text>
              </div>
              <strong className="proposal-context-value">{formatBalance(asset.balance)}</strong>
            </div>
          ))
        ) : (
          <Text className="proposal-context-detail">No configured treasury assets.</Text>
        )}
      </div>
    </DataState>
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
  const copyAddress = async (address: string) => {
    await navigator.clipboard?.writeText(address);
  };

  return (
    <>
      <div className="proposal-context-search">
        <Search size={15} aria-hidden="true" />
        <Input
          aria-label="Search DAO members"
          placeholder="Search address"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="proposal-context-panel-actions">
        <Text className="proposal-context-detail">{data ? `${data.total} members indexed` : 'Member directory'}</Text>
        <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </Button>
      </div>
      <DataState loading={isLoading && !data} error={error}>
        {rows.length ? (
          <div className="proposal-context-list">
            {rows.slice(0, 12).map((member, index) => (
              <div className="proposal-context-member" key={member.address}>
                <div className="proposal-context-member-heading">
                  <Badge>#{index + 1}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Copy ${member.address}`}
                    onClick={() => void copyAddress(member.address)}
                  >
                    <Copy size={14} aria-hidden="true" />
                  </Button>
                </div>
                <ShortId value={member.address} />
                <Text className="proposal-context-detail">
                  {formatNumber(member.voting_power)} voting power · {member.owned_token_count} tokens
                </Text>
              </div>
            ))}
            {rows.length > 12 ? <Text className="proposal-context-detail">Showing the top 12 matches.</Text> : null}
          </div>
        ) : (
          <Text className="proposal-context-detail">No members match this address.</Text>
        )}
      </DataState>
    </>
  );
}

function HistoryPanel({ daoId }: { daoId: string }) {
  const { data, error, isLoading } = useSWR<ProposalListResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/proposals?limit=8`,
    fetchJson,
    { keepPreviousData: true }
  );

  return (
    <DataState loading={isLoading && !data} error={error}>
      <div className="proposal-context-list">
        {data?.items.length ? (
          data.items.map((proposal) => (
            <Link
              className="proposal-context-history-row"
              href={`/dao/${daoId}/proposals/${proposal.proposalNumber}`}
              key={proposal.proposalId}
            >
              <div>
                <Text className="proposal-context-detail">
                  #{proposal.proposalNumber} · {formatDate(proposal.timestamp)}
                </Text>
                <strong>{proposal.metadata.title || 'Untitled proposal'}</strong>
              </div>
              <Badge>{proposal.stateLabel}</Badge>
            </Link>
          ))
        ) : (
          <Text className="proposal-context-detail">No past proposals yet. This can be the DAO's first decision.</Text>
        )}
      </div>
    </DataState>
  );
}

export function ProposalContextRail({ activeActionType, mobileOpen, onMobileClose }: ProposalContextRailProps) {
  const { daoId, daoTokenAddress, daoConfig: config } = useDaoContext();
  const [activeTab, setActiveTab] = useState<ContextTab>(
    activeActionType?.includes('transfer') ? 'treasury' : 'snapshot'
  );
  const { data: balances, error: balancesError, isLoading: balancesLoading } = useTreasuryBalances(config);
  const { data: members, error: membersError, isLoading: membersLoading } = useGoldskyMemberList(daoTokenAddress, 1);
  const {
    data: proposals,
    error: proposalsError,
    isLoading: proposalsLoading
  } = useSWR<ProposalListResponse>(`/api/dao/${encodeURIComponent(daoId)}/proposals?limit=8`, fetchJson, {
    keepPreviousData: true
  });

  const selectTab = (tab: ContextTab) => {
    setActiveTab(tab);
  };

  return (
    <aside className={`proposal-context-rail${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="DAO context">
      <div className="proposal-context-rail__header">
        <div>
          <Text className="label">DAO workspace</Text>
          <Text className="proposal-context-rail__title">Reference while you draft</Text>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="proposal-context-close"
          onClick={onMobileClose}
          aria-label="Close DAO context"
        >
          <X size={18} aria-hidden="true" />
        </Button>
      </div>
      <nav className="proposal-context-tabs" aria-label="DAO context views">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? 'is-active' : undefined}
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            aria-selected={activeTab === tab.id}
            role="tab"
          >
            <span className="proposal-context-tab-label">{tab.label}</span>
            <span className="proposal-context-tab-short-label">{tab.shortLabel}</span>
          </button>
        ))}
      </nav>

      <div className="proposal-context-rail__body">
        {activeTab === 'snapshot' ? (
          <Stack gap="4">
            <div>
              <Text className="proposal-context-kicker">Current state</Text>
              <Text className="proposal-context-intro">A quick read on the DAO before you choose what to change.</Text>
            </div>
            <div className="proposal-context-metrics">
              <Metric label="Members" value={members ? formatNumber(members.total) : '—'} detail="Token holders" />
              <Metric
                label="Treasury assets"
                value={balances ? formatNumber(balances.length) : '—'}
                detail="Configured assets"
              />
              <Metric
                label="Recent proposals"
                value={proposals ? formatNumber(proposals.items.length) : '—'}
                detail="Latest 8"
              />
            </div>
            <DataState
              loading={balancesLoading || membersLoading || proposalsLoading}
              error={balancesError || membersError || proposalsError}
            >
              <Card className="proposal-context-note" p="3">
                <WalletCards size={17} aria-hidden="true" />
                <Text>
                  Use the rail to look up addresses, check available assets, or compare how this DAO has handled similar
                  decisions.
                </Text>
              </Card>
            </DataState>
          </Stack>
        ) : null}
        {activeTab === 'treasury' ? (
          <Stack gap="4">
            <div>
              <Text className="proposal-context-kicker">Available to act on</Text>
              <Text className="proposal-context-intro">
                Check live balances before drafting a transfer or funding request.
              </Text>
            </div>
            <TreasuryPanel balances={balances} loading={balancesLoading} error={balancesError} />
          </Stack>
        ) : null}
        {activeTab === 'members' ? (
          <Stack gap="4">
            <div>
              <Text className="proposal-context-kicker">Find a recipient</Text>
              <Text className="proposal-context-intro">Search the member directory without leaving the proposal.</Text>
            </div>
            <MemberPanel daoTokenAddress={daoTokenAddress} />
          </Stack>
        ) : null}
        {activeTab === 'history' ? (
          <Stack gap="4">
            <div>
              <Text className="proposal-context-kicker">Learn from precedent</Text>
              <Text className="proposal-context-intro">Review recent decisions before writing a new one.</Text>
            </div>
            <HistoryPanel daoId={daoId} />
          </Stack>
        ) : null}
      </div>
      <Link className="proposal-context-rail__footer" href={`/dao/${daoId}/proposals`}>
        Browse all proposals <ExternalLink size={14} aria-hidden="true" />
      </Link>
    </aside>
  );
}
