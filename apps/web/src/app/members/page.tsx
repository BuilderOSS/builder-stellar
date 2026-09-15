'use client';

import { Grid, Stack } from 'styled-system/jsx';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Card, ShortId, Text } from '@/components/ui';
import { getDaoAccountRole } from '@/lib/account-role';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useGoldskyMemberList } from '@/lib/goldsky-queries';

export default function MembersPage() {
  const { data, error, isLoading, mutate } = useGoldskyMemberList(100);
  const rows = data?.items ?? [];
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());

  return (
    <DaoShell>
      <PageSection
        eyebrow="Members"
        title="Voting power directory"
        description="A Goldsky-backed view of token holders with non-zero balances."
      >
        <Card p="5">
          <Stack gap="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <Text className="label">Goldsky members</Text>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {error ? (
              <Text className="lede" style={{ margin: 0 }}>
                {error.message}
              </Text>
            ) : null}
            {isLoading ? (
              <Text className="lede" style={{ margin: 0 }}>
                Loading balances...
              </Text>
            ) : null}
            {!isLoading && !rows.length ? (
              <Text className="lede" style={{ margin: 0 }}>
                No token holders indexed yet.
              </Text>
            ) : (
              <Grid columns={{ base: 1, lg: 2 }} gap="4">
                {rows.map((row, index) => (
                  <Card key={row.address} p="4">
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
            )}
          </Stack>
        </Card>
      </PageSection>
    </DaoShell>
  );
}
