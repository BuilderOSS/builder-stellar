'use client';

import { Grid, Stack } from 'styled-system/jsx';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, ShortId, Text } from '@/components/ui';
import { getDaoAccountRole } from '@/lib/account-role';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useGoldskyMemberList } from '@/lib/goldsky-queries';

export default function MembersPage() {
  const { data, error, isLoading, mutate } = useGoldskyMemberList(100);
  const rows = data?.items ?? [];
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());

  return (
    <DaoShell>
      <PageSection title="Members" description="A Goldsky-backed view of token holders with non-zero balances.">
        <Card p="5">
          <Stack gap="3">
            <div className="section-toolbar">
              <Text className="label">Goldsky members</Text>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {error ? (
              <Callout variant="error" title="Member directory unavailable" description={error.message} />
            ) : null}
            {isLoading ? <Callout variant="info" title="Loading member balances…" /> : null}
            {!isLoading && !rows.length ? (
              <div className="empty-state" role="status">
                <Text className="lede" style={{ margin: '0 auto' }}>
                  No token holders are indexed yet.
                </Text>
              </div>
            ) : (
              <>
                <div className="members-table-wrap">
                  <table className="members-table">
                    <thead>
                      <tr>
                        <th scope="col">Address</th>
                        <th scope="col">Voting power</th>
                        <th scope="col">Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={row.address}>
                          <td>
                            <ShortId value={row.address} />
                          </td>
                          <td className="members-table-number">{row.voting_power}</td>
                          <td className="members-table-number">#{index + 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Grid className="members-card-list" columns={{ base: 1 }} gap="3">
                  {rows.map((row, index) => (
                    <Card className="interactive-card" key={row.address} p="4">
                      <Stack gap="2">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <Badge>#{index + 1}</Badge>
                          <Badge>Tokens {row.owned_token_count}</Badge>
                        </div>
                        <ShortId value={row.address} label={getDaoAccountRole(config, row.address) ?? 'Address'} />
                      </Stack>
                    </Card>
                  ))}
                </Grid>
              </>
            )}
          </Stack>
        </Card>
      </PageSection>
    </DaoShell>
  );
}
