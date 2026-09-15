'use client';

import Image from 'next/image';
import { Grid, Stack } from 'styled-system/jsx';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, ShortId, Text } from '@/components/ui';
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
        border: '1px solid rgba(148, 163, 184, 0.22)',
        background: 'rgba(15, 23, 42, 0.72)',
        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.22)',
        color: '#bfdbfe',
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

  return (
    <DaoShell>
      <PageSection
        eyebrow="Treasury"
        title="Execution boundary"
        description="The treasury is where approved governance actions become real contract calls."
      >
        <Grid columns={{ base: 1 }} gap="4">
          <Card p="5">
            <Stack gap="4">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start'
                }}
              >
                <div>
                  <Text className="label">Treasury overview</Text>
                  <Heading style={{ fontSize: '1.35rem', marginTop: '6px' }}>Assets under governance control</Heading>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Contract-held assets governed by proposals.
                  </Text>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge>{balanceLoading ? 'Syncing' : `${balances?.length ?? 0} tracked`}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void mutateBalances()}
                    disabled={balanceLoading}
                  >
                    {balanceLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
              </div>

              <Card
                p="4"
                style={{ border: '1px solid rgba(96, 165, 250, 0.24)', background: 'rgba(30, 64, 175, 0.1)' }}
              >
                <Stack gap="2" style={{ minWidth: 0 }}>
                  <Text className="label">Treasury contract</Text>
                  {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
                </Stack>
              </Card>

              {balanceError ? <Callout variant="error" title={balanceError.message} /> : null}

              {balanceLoading && !balances ? <Callout variant="info" title="Loading treasury balances..." /> : null}

              {balances && balances.length > 0 ? (
                <Grid columns={{ base: 1, md: 2, xl: 3 }} gap="3">
                  {balances.map((asset) => {
                    const hasBalance = parseBalance(asset.balance) > 0;
                    const assetConfig = findAsset(config.name, asset.assetCode);
                    return (
                      <Card
                        key={asset.isNative ? 'XLM' : `${asset.assetCode}-${asset.assetIssuer}`}
                        p="4"
                        style={{
                          border: asset.isNative
                            ? '1px solid rgba(96, 165, 250, 0.3)'
                            : '1px solid rgba(160, 194, 225, 0.16)',
                          background: asset.isNative ? 'rgba(30, 64, 175, 0.1)' : 'rgba(157, 179, 203, 0.05)',
                          opacity: hasBalance ? 1 : 0.74
                        }}
                      >
                        <Stack gap="4">
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
                            <AssetMark code={asset.assetCode} imageSrc={assetConfig?.imageSrc} />
                            <Stack gap="1" style={{ minWidth: 0 }}>
                              <Text style={{ margin: 0, fontWeight: 800 }}>{asset.assetCode}</Text>
                              <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                                {assetConfig?.name ?? asset.assetCode}
                              </Text>
                            </Stack>
                          </div>
                          <div>
                            <Text style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
                              {formatAssetBalance(asset.balance)}
                            </Text>
                            <Text className="lede" style={{ margin: 0, fontSize: '0.78rem' }}>
                              {asset.assetCode}
                            </Text>
                          </div>
                        </Stack>
                      </Card>
                    );
                  })}
                </Grid>
              ) : balances && balances.length === 0 ? (
                <Callout variant="info" title="No configured treasury balances found." />
              ) : null}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Heading style={{ fontSize: '1.2rem' }}>Recent executions</Heading>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              {error ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {error.message}
                </Text>
              ) : null}
              {!data?.items.length ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Treasury execution history will appear here once actions are indexed.
                </Text>
              ) : (
                <Stack gap="2">
                  {data.items
                    .filter((item) => item.contract_role === 'treasury')
                    .map((item) => (
                      <Card key={item.activity_id} p="4">
                        <Stack gap="1">
                          <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                          <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                            {item.summary}
                          </Text>
                          <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                            Ledger {item.ledger_sequence}
                          </Text>
                        </Stack>
                      </Card>
                    ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>
      </PageSection>
    </DaoShell>
  );
}
