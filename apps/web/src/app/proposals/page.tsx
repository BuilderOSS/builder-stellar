'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Grid, Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { ProposalStateBadge } from '@/components/proposal/proposal-state-badge';
import type { ProposalListResponse } from '@/components/proposal/types';
import { Button, Callout, Card, Heading, Text } from '@/components/ui';
import type { GovernorSettings } from '@/lib/admin-queries';
import { useGovernorSettings } from '@/lib/admin-queries';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useVotingPower, type VotingPowerSnapshot } from '@/lib/voting-power';
import { useDaoSessionStore } from '@/stores/dao-session-store';

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

function formatProposalCreationDisabledMessage(
  votingPower: VotingPowerSnapshot | undefined,
  settings: GovernorSettings | undefined,
  errorMessage?: string
) {
  if (errorMessage) {
    return errorMessage;
  }

  if (!votingPower || !settings) {
    return 'Connect a wallet with enough voting power to create proposals.';
  }

  return `You need at least ${settings.proposalThreshold.toString()} votes to create a proposal. Current voting power: ${votingPower.votes.toString()}.`;
}

export default function ProposalsPage() {
  const router = useRouter();
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const {
    data: votingPower,
    error: votingPowerError,
    isLoading: votingPowerLoading
  } = useVotingPower(config, session.address);
  const {
    data: governorSettings,
    error: governorSettingsError,
    isLoading: governorSettingsLoading
  } = useGovernorSettings(config, session.address || config.adminAddress);
  const { data, error, isLoading, mutate } = useSWR<ProposalListResponse>(
    '/api/proposals?limit=24',
    async (url: string) => {
      const response = await fetch(url, { cache: 'no-store' });
      const json = (await response.json()) as ProposalListResponse;
      if (!response.ok) {
        throw new Error(json.message || 'Proposal list failed');
      }
      return json;
    },
    { keepPreviousData: true }
  );
  const items = data?.items ?? [];
  const proposalEligibilityLoading = votingPowerLoading || governorSettingsLoading;
  const proposalEligibilityError = votingPowerError ?? governorSettingsError;
  const hasProposalVotes = Boolean(
    votingPower && governorSettings && votingPower.votes >= governorSettings.proposalThreshold
  );
  const createDisabled =
    !session.address || proposalEligibilityLoading || Boolean(proposalEligibilityError) || !hasProposalVotes;
  const createDisabledMessage = createDisabled
    ? formatProposalCreationDisabledMessage(votingPower, governorSettings, proposalEligibilityError?.message)
    : '';

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Governance workspace"
        description="Browse proposal history and review on-chain proposal state."
      >
        <Stack gap="4">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <Text className="label">Goldsky proposals</Text>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => router.push('/proposals/create')}
                disabled={createDisabled}
              >
                {proposalEligibilityLoading ? 'Checking eligibility...' : 'Create proposal'}
              </Button>
            </div>
          </div>

          {createDisabledMessage ? <Callout variant="warning" title={createDisabledMessage} /> : null}
          {error ? <Callout variant="error" title={error.message} /> : null}
          {!items.length ? (
            <Text className="lede" style={{ margin: 0 }}>
              No proposal rows indexed yet.
            </Text>
          ) : (
            <Grid columns={{ base: 1 }} gap="4">
              {items.map((item) => (
                <Card key={item.proposalId} p="4">
                  <Link href={`/proposals/${item.proposalNumber}`} style={{ textDecoration: 'none' }}>
                    <Stack gap="2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Text className="mono" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                          Proposal #{item.proposalNumber}
                        </Text>
                        <ProposalStateBadge label={item.stateLabel} />
                      </div>
                      <Heading style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{item.metadata.title}</Heading>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.86rem' }}>
                        {formatTimestamp(item.timestamp)}
                      </Text>
                    </Stack>
                  </Link>
                </Card>
              ))}
            </Grid>
          )}
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
