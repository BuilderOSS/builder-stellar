'use client';

import { RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { Stack } from 'styled-system/jsx';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Button, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
import { findAsset } from '@/lib/assets-config';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useGoldskyActivityFeed } from '@/lib/goldsky-queries';
import { useTreasuryBalances } from '@/lib/treasury-queries';

function parseBalance(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAssetBalance(value: string) {
  const [whole = '0', decimal = ''] = value.split('.');
  const formattedWhole = Number(whole).toLocaleString();
  const trimmedDecimal = decimal.slice(0, 7).replace(/0+$/, '');
  return trimmedDecimal ? `${formattedWhole}.${trimmedDecimal}` : formattedWhole;
}

function AssetMark({ code, imageSrc }: { code: string; imageSrc?: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '46px',
        height: '46px',
        borderRadius: '999px',
        border: '1px solid var(--border-strong)',
        background: 'var(--surface-2)',
        color: 'var(--text-primary)',
        display: 'grid',
        fontWeight: 800,
        letterSpacing: '-0.04em',
        overflow: 'hidden',
        placeItems: 'center'
      }}
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          width={46}
          height={46}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        code.slice(0, 2)
      )}
    </div>
  );
}

export default function TreasuryPage() {
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data, error, isLoading, mutate } = useGoldskyActivityFeed(8);
  const {
    data: balances,
    error: balanceError,
    isLoading: balanceLoading,
    mutate: mutateBalances
  } = useTreasuryBalances(config);
  const treasuryActivity = (data?.items ?? []).filter((item) => item.contract_role === 'treasury');
  const fundedAssetCount = balances?.filter((asset) => parseBalance(asset.balance) > 0).length ?? 0;
  const refreshing = balanceLoading || isLoading;

  return (
    <DaoShell>
      <PageSection title="Treasury" description="Contract-held assets governed by approved proposals.">
        <div className="treasury-layout">
          <Stack gap="4">
            <Card p="5">
              <Stack gap="4">
                <div className="section-toolbar">
                  <div>
                    <Text className="label">Asset allocation</Text>
                    <Heading style={{ fontSize: '1.35rem', marginTop: '6px' }}>
                      {balanceLoading && !balances
                        ? 'Loading assets…'
                        : `${fundedAssetCount} funded asset${fundedAssetCount === 1 ? '' : 's'}`}
                    </Heading>
                  </div>
                </div>

                <Card p="4" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-0)' }}>
                  <div className="treasury-contract-row">
                    <Stack gap="2" style={{ minWidth: 0 }}>
                      <Text className="label">Treasury contract</Text>
                      {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
                    </Stack>
                    <Button
                      className="treasury-refresh-button"
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void Promise.all([mutateBalances(), mutate()])}
                      disabled={refreshing}
                      aria-label="Refresh treasury data"
                      title="Refresh treasury data"
                    >
                      <RefreshCw aria-hidden="true" size={16} className={refreshing ? 'is-spinning' : undefined} />
                    </Button>
                  </div>
                </Card>

                {balanceError ? <Callout variant="error" title={balanceError.message} /> : null}

                {balanceLoading && !balances ? <Callout variant="info" title="Loading treasury balances..." /> : null}
              </Stack>
            </Card>

            {balances && balances.length > 0 ? (
              balances.map((asset) => {
                const hasBalance = parseBalance(asset.balance) > 0;
                const assetConfig = findAsset(config.name, asset.assetCode);
                return (
                  <Card
                    key={asset.isNative ? 'XLM' : `${asset.assetCode}-${asset.assetIssuer}`}
                    p="4"
                    style={{ opacity: hasBalance ? 1 : 0.74 }}
                  >
                    <div className="treasury-asset-row">
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                        <AssetMark code={asset.assetCode} imageSrc={assetConfig?.imageSrc} />
                        <Stack gap="1" style={{ minWidth: 0 }}>
                          <Text style={{ margin: 0, fontWeight: 800 }}>{assetConfig?.name ?? asset.assetCode}</Text>
                          <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                            {asset.isNative ? 'Native asset' : asset.assetCode}
                          </Text>
                        </Stack>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Text style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800 }}>
                          {formatAssetBalance(asset.balance)}
                        </Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                          {asset.assetCode}
                        </Text>
                      </div>
                    </div>
                  </Card>
                );
              })
            ) : balances && balances.length === 0 ? (
              <div className="empty-state" role="status">
                <Text className="lede" style={{ margin: '0 auto' }}>
                  No configured treasury balances were found.
                </Text>
              </div>
            ) : null}
          </Stack>

          <Card p="5" className="treasury-activity-panel">
            <Stack gap="3">
              <div>
                <Text className="label">Treasury activity</Text>
                <Heading style={{ fontSize: '1.2rem', marginTop: '6px' }}>Recent executions</Heading>
              </div>
              {error ? (
                <Callout variant="error" title="Treasury activity unavailable" description={error.message} />
              ) : null}
              {isLoading && !data ? <Callout variant="info" title="Loading treasury activity…" /> : null}
              {!isLoading && !treasuryActivity.length ? (
                <div className="empty-state" role="status">
                  <Text className="lede" style={{ margin: '0 auto' }}>
                    Treasury execution history will appear here once actions are indexed.
                  </Text>
                </div>
              ) : (
                <div className="treasury-activity-list">
                  {treasuryActivity.map((item) => (
                    <div className="treasury-activity-row" key={item.activity_id}>
                      <Stack gap="1" style={{ minWidth: 0 }}>
                        <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                          {item.summary}
                        </Text>
                      </Stack>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        Ledger {item.ledger_sequence}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </Stack>
          </Card>
        </div>
      </PageSection>
    </DaoShell>
  );
}
