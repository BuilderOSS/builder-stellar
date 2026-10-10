'use client';

import { RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { DaoContractList } from '@/components/dao-contract-list';
import { Badge, Button, Callout, Input, ShortId, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { useGoldskyMemberList } from '@/lib/goldsky-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';

import type { ProposalListResponse } from './types';

type ContextTab = 'treasury' | 'members' | 'contracts' | 'history';

type ProposalContextRailProps = {
  activeActionType?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
  mobileTriggerRef: React.RefObject<HTMLButtonElement | null>;
};

const tabs: Array<{ id: ContextTab; label: string; shortLabel: string }> = [
  { id: 'treasury', label: 'Treasury', shortLabel: 'Treasury' },
  { id: 'members', label: 'Members', shortLabel: 'Members' },
  { id: 'contracts', label: 'Contracts', shortLabel: 'Contracts' },
  { id: 'history', label: 'History', shortLabel: 'History' }
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

function DataState({
  loading,
  error,
  hasData,
  loadingContent,
  children
}: {
  loading: boolean;
  error?: Error;
  hasData: boolean;
  loadingContent: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div role="status" aria-busy="true">
        {loadingContent}
      </div>
    );
  }

  if (error && !hasData) {
    return <Callout variant="error" title="Data unavailable" description={error.message} />;
  }

  return (
    <>
      {error ? <Callout variant="error" title="Some data may be out of date" description={error.message} /> : null}
      {children}
    </>
  );
}

function PanelSkeleton({ type }: { type: 'balances' | 'members' | 'history' }) {
  const count = type === 'members' ? 4 : 3;

  return (
    <div className="proposal-context-loading">
      {Array.from({ length: count }, (_, index) => (
        <div className="proposal-context-skeleton-row" key={index}>
          <Skeleton style={{ width: type === 'history' ? '68%' : '42%', height: '0.85rem' }} />
          <Skeleton style={{ width: type === 'members' ? '78%' : '34%', height: '0.7rem' }} />
        </div>
      ))}
    </div>
  );
}

function TreasuryPanel({ config }: { config: Parameters<typeof useTreasuryBalances>[0] }) {
  const { data: balances, error, isLoading } = useTreasuryBalances(config);

  return (
    <DataState
      loading={isLoading && !balances}
      error={error}
      hasData={Boolean(balances)}
      loadingContent={<PanelSkeleton type="balances" />}
    >
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
          <Text className="proposal-context-detail">No assets are configured for this treasury.</Text>
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
  return (
    <div className="proposal-context-members">
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
      <DataState
        loading={isLoading && !data}
        error={error}
        hasData={Boolean(data)}
        loadingContent={<PanelSkeleton type="members" />}
      >
        {rows.length ? (
          <div className="proposal-context-list">
            {rows.slice(0, 12).map((member, index) => (
              <div className="proposal-context-member" key={member.address}>
                <div className="proposal-context-member-heading">
                  <Badge>#{index + 1}</Badge>
                  <div className="proposal-context-member-address">
                    <ShortId value={member.address} compact />
                  </div>
                </div>
                <Text className="proposal-context-detail">{formatNumber(member.voting_power)} voting power</Text>
              </div>
            ))}
            {rows.length > 12 ? <Text className="proposal-context-detail">Showing the top 12 matches.</Text> : null}
          </div>
        ) : (
          <Text className="proposal-context-detail">No members match that address.</Text>
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
    <DataState
      loading={isLoading && !data}
      error={error}
      hasData={Boolean(data)}
      loadingContent={<PanelSkeleton type="history" />}
    >
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
          <Text className="proposal-context-detail">
            No proposals yet. This could be the DAO&apos;s first decision.
          </Text>
        )}
      </div>
    </DataState>
  );
}

export function ProposalContextRail({
  activeActionType,
  mobileOpen,
  onMobileClose,
  mobileTriggerRef
}: ProposalContextRailProps) {
  const { daoId, daoTokenAddress, daoConfig: config } = useDaoContext();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const wasMobileOpen = useRef(false);
  const [activeTab, setActiveTab] = useState<ContextTab>(
    activeActionType?.includes('transfer') ? 'treasury' : 'members'
  );

  useEffect(() => {
    if (!mobileOpen) {
      if (wasMobileOpen.current) {
        wasMobileOpen.current = false;
        mobileTriggerRef.current?.focus();
      }
      return;
    }

    wasMobileOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose();
      if (event.key !== 'Tab') return;

      const focusable = railRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!railRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, mobileTriggerRef, onMobileClose]);

  const selectTab = (tab: ContextTab) => {
    setActiveTab(tab);
  };

  return (
    <>
      {mobileOpen ? (
        <button
          className="proposal-context-backdrop"
          type="button"
          aria-label="Close DAO context"
          onClick={onMobileClose}
        />
      ) : null}
      <aside
        id="proposal-context-rail"
        ref={railRef}
        className={`proposal-context-rail${mobileOpen ? ' is-mobile-open' : ''}`}
        aria-label="DAO context"
        aria-labelledby="proposal-context-title"
        aria-modal={mobileOpen || undefined}
        role={mobileOpen ? 'dialog' : undefined}
      >
        <div className="proposal-context-rail__header">
          <div>
            <Text className="label">DAO workspace</Text>
            <Text className="proposal-context-rail__title" id="proposal-context-title">
              Context for your proposal
            </Text>
            <Text className="proposal-context-intro">Live details to ground your next decision.</Text>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="proposal-context-close"
            onClick={onMobileClose}
            aria-label="Close DAO context"
            ref={closeButtonRef}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        <nav className="proposal-context-tabs" aria-label="DAO workspace views" role="tablist">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? 'is-active' : undefined}
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-selected={activeTab === tab.id}
              aria-controls="proposal-context-panel"
              role="tab"
            >
              <span className="proposal-context-tab-label">{tab.label}</span>
              <span className="proposal-context-tab-short-label">{tab.shortLabel}</span>
            </button>
          ))}
        </nav>

        <div className="proposal-context-rail__body" id="proposal-context-panel" role="tabpanel" tabIndex={0}>
          {activeTab === 'treasury' ? (
            <Stack gap="4">
              <div>
                <Text className="proposal-context-kicker">Available resources</Text>
                <Text className="proposal-context-intro">
                  Check balances before proposing a transfer or funding change.
                </Text>
              </div>
              <TreasuryPanel config={config} />
            </Stack>
          ) : null}
          {activeTab === 'members' ? (
            <Stack gap="4">
              <div>
                <Text className="proposal-context-kicker">People in the DAO</Text>
                <Text className="proposal-context-intro">Find a recipient or verify voting power.</Text>
              </div>
              <MemberPanel daoTokenAddress={daoTokenAddress} />
            </Stack>
          ) : null}
          {activeTab === 'contracts' ? (
            <Stack gap="4">
              <div>
                <Text className="proposal-context-kicker">On-chain addresses</Text>
                <Text className="proposal-context-intro">Copy the contracts this proposal can interact with.</Text>
              </div>
              <DaoContractList config={config} compact />
            </Stack>
          ) : null}
          {activeTab === 'history' ? (
            <Stack gap="4">
              <div>
                <Text className="proposal-context-kicker">Past decisions</Text>
                <Text className="proposal-context-intro">See how this DAO has handled similar proposals.</Text>
              </div>
              <HistoryPanel daoId={daoId} />
            </Stack>
          ) : null}
        </div>
      </aside>
    </>
  );
}
