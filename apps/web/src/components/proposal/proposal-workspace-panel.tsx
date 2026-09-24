'use client';

import { Check, Copy, RefreshCw, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Badge, Button, Card, Input, Skeleton, Text } from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { type GoldskyMemberItem, useGoldskyMemberList } from '@/lib/goldsky-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';

type WorkspaceTab = 'queued' | 'treasury' | 'members';

function shortenAddress(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatBalance(value: string, code: string) {
  const parsed = Number(value);
  return `${Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { maximumFractionDigits: 7 }) : value} ${code}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked by browser permissions or an insecure context.
    }
  }

  return (
    <button
      className="proposal-workspace-item__copy-button"
      type="button"
      onClick={copyValue}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function TreasuryWorkspace({ config }: { config: DaoNetworkConfig }) {
  const { data: balances, isLoading, error, mutate } = useTreasuryBalances(config);

  return (
    <div className="proposal-workspace-view">
      <div className="proposal-workspace-heading">
        <div>
          <Text className="label">Available assets</Text>
          <Text className="proposal-workspace-hint">Check balances while assembling transfer actions.</Text>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => mutate()}
          disabled={isLoading}
          aria-label="Refresh treasury balances"
        >
          <RefreshCw aria-hidden="true" size={14} />
          Refresh
        </Button>
      </div>
      {error ? <Text className="proposal-workspace-error">Treasury balances are unavailable right now.</Text> : null}
      {isLoading && !balances ? (
        <div className="proposal-workspace-loading" role="status" aria-busy="true">
          <Skeleton style={{ height: '52px' }} />
          <Skeleton style={{ height: '52px' }} />
        </div>
      ) : (
        <div className="proposal-workspace-list">
          {(balances || []).map((asset) => {
            const reference = asset.assetIssuer || asset.assetCode;
            return (
              <div className="proposal-workspace-item" key={`${asset.assetCode}-${asset.assetIssuer || 'native'}`}>
                <div>
                  <Text style={{ fontWeight: 700 }}>{asset.isNative ? 'Native XLM' : asset.assetCode}</Text>
                  <Text className="proposal-workspace-item__detail">
                    {formatBalance(asset.balance, asset.assetCode)}
                  </Text>
                </div>
                <div className="proposal-workspace-item__actions">
                  <CopyButton value={reference} label={`${asset.assetCode} reference`} />
                  <CopyButton value={asset.balance} label={`${asset.assetCode} amount`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MembersWorkspace({ config }: { config: DaoNetworkConfig }) {
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useGoldskyMemberList(config.tokenContractId);
  const normalizedQuery = query.trim().toLowerCase();
  const members = (data?.items || []).filter((member) => member.address.toLowerCase().includes(normalizedQuery));

  return (
    <div className="proposal-workspace-view">
      <div className="proposal-workspace-heading">
        <div>
          <Text className="label">DAO members</Text>
          <Text className="proposal-workspace-hint">Find a recipient and copy their address or voting power.</Text>
        </div>
        <Text className="proposal-workspace-count">{data?.total ?? 0}</Text>
      </div>
      <label className="proposal-workspace-search">
        <span className="sr-only">Search members</span>
        <Search aria-hidden="true" size={15} />
        <Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search address" />
      </label>
      {error ? <Text className="proposal-workspace-error">Members are unavailable right now.</Text> : null}
      {isLoading ? <Text role="status">Loading members...</Text> : null}
      {!isLoading && !members.length ? <Text className="proposal-workspace-empty">No matching members.</Text> : null}
      <div className="proposal-workspace-list">
        {members.map((member) => (
          <MemberRow key={member.address} member={member} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: GoldskyMemberItem }) {
  return (
    <div className="proposal-workspace-item">
      <div>
        <Text style={{ fontWeight: 700 }} title={member.address}>
          {shortenAddress(member.address)}
        </Text>
        <Text className="proposal-workspace-item__detail">
          {member.voting_power} voting power · {member.owned_token_count} tokens
        </Text>
      </div>
      <div className="proposal-workspace-item__actions">
        <CopyButton value={member.address} label="member address" />
        <Badge>{member.voting_power}</Badge>
      </div>
    </div>
  );
}

export function ProposalWorkspacePanel({ config, children }: { config: DaoNetworkConfig; children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('queued');
  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'queued', label: 'Queued' },
    { id: 'treasury', label: 'Treasury' },
    { id: 'members', label: 'Members' }
  ];

  return (
    <Card className="proposal-workspace-panel" p="5">
      <div className="proposal-workspace-tabs" role="tablist" aria-label="Proposal workspace">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="proposal-workspace-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="proposal-workspace-content" role="tabpanel">
        {activeTab === 'queued' ? (
          children
        ) : activeTab === 'treasury' ? (
          <TreasuryWorkspace config={config} />
        ) : (
          <MembersWorkspace config={config} />
        )}
      </div>
    </Card>
  );
}
