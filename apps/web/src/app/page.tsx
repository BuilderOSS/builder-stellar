'use client';

import { useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { TokenCard } from '@/components/token/token-card';
import { Badge, Button, Card, Heading, ShortId, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useGoldskyActivityFeed, useGoldskyHealth } from '@/lib/goldsky-queries';
import { useTokenInventory } from '@/lib/token-queries';

function formatTimestamp(timestamp: number) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(timestamp * 1000)
    );
  } catch {
    return String(timestamp);
  }
}

const ACTIVITY_PAGE_SIZE = 12;
const TOKEN_PAGE_SIZE = 8;

export default function Page() {
  const network = getDefaultDaoNetwork();
  const config = getDaoNetworkConfig(network);
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZE);
  const [tokenLimit, setTokenLimit] = useState(TOKEN_PAGE_SIZE);
  const {
    data: goldskyHealth,
    error: goldskyHealthError,
    isLoading: goldskyHealthLoading,
    mutate: refreshHealth
  } = useGoldskyHealth();
  const {
    data: activityFeed,
    error: activityError,
    isLoading: activityLoading,
    mutate: refreshFeed
  } = useGoldskyActivityFeed(activityLimit);
  const { data: tokens, error: tokenError, isLoading: tokenLoading, mutate: refreshTokens } = useTokenInventory();
  const tokenItems = tokens?.items.slice(0, tokenLimit) ?? [];
  const canLoadMoreTokens = Boolean(tokens && tokens.items.length > tokenLimit);
  const activityItems = activityFeed?.items ?? [];
  const canLoadMoreActivity = Boolean(activityFeed?.hasMore);

  return (
    <DaoShell>
      <PageSection
        eyebrow="Dashboard"
        title="Governance at a glance"
        description="Track DAO contracts, token supply, Goldsky indexing, and recent governance activity from one clean home screen."
      >
        <Grid columns={{ base: 1, md: 2, xl: 5 }} gap="4">
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Token</Text>
              {config.tokenContractId ? <ShortId value={config.tokenContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Governor</Text>
              {config.governorContractId ? <ShortId value={config.governorContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Treasury</Text>
              {config.treasuryContractId ? <ShortId value={config.treasuryContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Auction</Text>
              {config.auctionContractId ? <ShortId value={config.auctionContractId} /> : <Text>Missing</Text>}
            </Stack>
          </Card>
          <Card p="5">
            <Stack gap="2">
              <Text className="label">Admin</Text>
              <ShortId value={config.adminAddress} />
            </Stack>
          </Card>
        </Grid>

        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <Text className="label">Tokens</Text>
                <Heading style={{ fontSize: '1.35rem' }}>Current live supply</Heading>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge>{tokenLoading ? 'Syncing' : `${tokens?.totalSupply ?? 0} live`}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshTokens()}
                  disabled={tokenLoading}
                >
                  {tokenLoading ? 'Refreshing...' : 'Refresh tokens'}
                </Button>
              </div>
            </div>

            {tokenError ? (
              <Text className="lede" style={{ margin: 0 }}>
                {tokenError.message}
              </Text>
            ) : null}
            {!tokenLoading && !tokens?.items.length ? (
              <Text className="lede" style={{ margin: 0 }}>
                No tokens indexed yet.
              </Text>
            ) : (
              <>
                <div className="token-inventory-grid">
                  {tokenItems.map((token) => (
                    <TokenCard key={token.tokenId} tokenId={token.tokenId} owner={token.owner} />
                  ))}
                </div>
                {canLoadMoreTokens ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTokenLimit((current) => current + TOKEN_PAGE_SIZE)}
                      disabled={tokenLoading}
                    >
                      {tokenLoading ? 'Loading...' : 'Show more tokens'}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Stack>
          <style jsx>{`
            .token-inventory-grid {
              display: grid;
              gap: 18px;
              grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            }

            @media (min-width: 768px) {
              .token-inventory-grid {
                gap: 20px;
                grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
              }
            }
          `}</style>
        </Card>

        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <Text className="label">Goldsky index</Text>
                <Heading style={{ fontSize: '1.35rem' }}>Indexer health</Heading>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refreshHealth()}
                disabled={goldskyHealthLoading}
              >
                {goldskyHealthLoading ? 'Refreshing...' : 'Refresh status'}
              </Button>
            </div>

            <Grid columns={{ base: 1, xl: 3 }} gap="4">
              {goldskyHealth ? (
                <Card p="5">
                  <Stack gap="2">
                    <Text className="label">Goldsky PostgreSQL index</Text>
                    <Heading style={{ fontSize: '1.2rem' }}>
                      {goldskyHealth.status === 'healthy' ? 'Healthy' : 'Unavailable'}
                    </Heading>
                    <div>
                      <Badge>
                        {goldskyHealth.latestLedger ? `Ledger ${goldskyHealth.latestLedger}` : 'No ledger data'}
                      </Badge>
                    </div>
                    <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                      {goldskyHealth.totalEvents ?? 0} indexed events
                    </Text>
                  </Stack>
                </Card>
              ) : null}
              {goldskyHealthLoading ? (
                <Card p="5">
                  <Text>Loading Goldsky status...</Text>
                </Card>
              ) : null}
              {goldskyHealthError ? (
                <Card p="5">
                  <Text>{goldskyHealthError.message}</Text>
                </Card>
              ) : null}
            </Grid>
          </Stack>
        </Card>

        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <Text className="label">Goldsky feed</Text>
                <Heading style={{ fontSize: '1.35rem' }}>Latest indexed DAO activity</Heading>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge>{activityLoading ? 'Syncing' : 'Live'}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshFeed()}
                  disabled={activityLoading}
                >
                  {activityLoading ? 'Refreshing...' : 'Refresh feed'}
                </Button>
              </div>
            </div>
            {activityError ? (
              <Text className="lede" style={{ margin: 0 }}>
                {activityError.message}
              </Text>
            ) : null}
            {!activityItems.length ? (
              <Text className="lede" style={{ margin: 0 }}>
                No indexed activity yet.
              </Text>
            ) : (
              <>
                <Stack gap="0">
                  {activityItems.map((item, index) => (
                    <div
                      key={item.activity_id}
                      style={{
                        borderTop: index === 0 ? 'none' : '1px solid rgba(148, 163, 184, 0.18)',
                        padding: '14px 0'
                      }}
                    >
                      <Stack gap="1">
                        <Text style={{ margin: 0, fontWeight: 700 }}>{item.title}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                          {item.summary}
                        </Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                          {formatTimestamp(Number(item.timestamp ?? 0))} | Ledger {item.ledger_sequence} |{' '}
                          {item.contract_role}
                        </Text>
                      </Stack>
                    </div>
                  ))}
                </Stack>
                {canLoadMoreActivity ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityLimit((current) => current + ACTIVITY_PAGE_SIZE)}
                      disabled={activityLoading}
                    >
                      {activityLoading ? 'Loading...' : 'Show more activity'}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Stack>
        </Card>
      </PageSection>
    </DaoShell>
  );
}
