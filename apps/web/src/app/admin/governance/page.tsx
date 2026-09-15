'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { type SignTransaction } from '@stellar/stellar-sdk/contract';
import { Client as GovernorClient } from '@nouns-builder-stellar/governor-bindings';
import { useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { DurationInput } from '@/components/admin/duration-input';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Input, Text } from '@/components/ui';
import { useGovernorSettings } from '@/lib/admin-queries';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { formatDuration } from '@/lib/format-duration';
import { useGoldskyGovernorAuthorities } from '@/lib/goldsky-queries';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type Drafts = Partial<{
  votingDelay: string;
  votingPeriod: string;
  proposalThreshold: string;
  quorumBps: string;
}>;

type GovernorSettingKey = 'votingDelay' | 'votingPeriod' | 'proposalThreshold' | 'quorumBps';

const EMPTY_DRAFTS: Drafts = {};

function formatThreshold(value: bigint) {
  return value.toString();
}

function parseWholeNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function parseBigIntValue(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return BigInt(trimmed);
}

function formatSecondsValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? formatDuration(value) : '—';
}

export default function GovernanceAdminPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<GovernorSettingKey | ''>('');
  const tx = useTransactionFeedback(config.name);
  const {
    data: settings,
    mutate: refreshSettings,
    error: settingsError,
    isLoading: settingsLoading
  } = useGovernorSettings(config, session.address || config.adminAddress);
  const {
    data: governorAuthorities,
    error: authorityError,
    isLoading: authorityLoading,
    mutate: refreshAuthorities
  } = useGoldskyGovernorAuthorities();
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasGovernanceAccess = Boolean(
    isOwner || governorAuthorities?.items.some((item) => item.authority === session.address)
  );

  async function getGovernor() {
    if (!session.address) {
      throw new Error('Connect a governance authority wallet first.');
    }

    if (!config.governorContractId) {
      throw new Error('Missing governor contract id in the active network config.');
    }

    return new GovernorClient({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: session.address,
      signTransaction: (async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
        StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
          address: opts?.address ?? session.address
        })) as SignTransaction
    });
  }

  async function submitGovernorUpdate(
    action: GovernorSettingKey,
    label: string,
    run: (governor: GovernorClient) => Promise<string>
  ) {
    if (!hasGovernanceAccess) {
      setFormMessage('Connect a governance authority wallet first.');
      return;
    }

    if (!session.address) {
      setFormMessage('Connect a governance authority wallet first.');
      return;
    }

    if (!config.governorContractId) {
      setFormMessage('Missing governor contract id in the active network config.');
      return;
    }

    setBusy(true);
    setActiveAction(action);
    setFormMessage('');
    tx.start(`Applying ${label.toLowerCase()}...`);

    try {
      const governor = await getGovernor();
      const hash = await run(governor);
      tx.submitted(`${label} submitted`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      setFormMessage('');
      await Promise.all([refreshSettings(), refreshAuthorities()]);
      tx.success(`${label} updated`, hash);
    } catch (error) {
      tx.fail(error, `${label} update failed`);
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  }

  async function applyVotingDelay() {
    if (!settings) return;
    const value = parseWholeNumber(drafts.votingDelay ?? String(settings.votingDelay));
    if (value === null) {
      setFormMessage('Voting delay must be a whole number.');
      return;
    }

    if (value === settings.votingDelay) {
      setFormMessage('Voting delay is unchanged.');
      return;
    }

    await submitGovernorUpdate('votingDelay', 'Voting delay', async (governor) => {
      const assembled = await governor.set_voting_delay({ caller: session.address || '', voting_delay: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  async function applyVotingPeriod() {
    if (!settings) return;
    const value = parseWholeNumber(drafts.votingPeriod ?? String(settings.votingPeriod));
    if (value === null) {
      setFormMessage('Voting period must be a whole number.');
      return;
    }

    if (value === settings.votingPeriod) {
      setFormMessage('Voting period is unchanged.');
      return;
    }

    await submitGovernorUpdate('votingPeriod', 'Voting period', async (governor) => {
      const assembled = await governor.set_voting_period({ caller: session.address || '', voting_period: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  async function applyProposalThreshold() {
    if (!settings) return;
    const value = parseBigIntValue(drafts.proposalThreshold ?? formatThreshold(settings.proposalThreshold));
    if (value === null) {
      setFormMessage('Proposal threshold must be a whole number.');
      return;
    }

    if (value === settings.proposalThreshold) {
      setFormMessage('Proposal threshold is unchanged.');
      return;
    }

    await submitGovernorUpdate('proposalThreshold', 'Proposal threshold', async (governor) => {
      const assembled = await governor.set_proposal_threshold({
        caller: session.address || '',
        proposal_threshold: value
      });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  async function applyQuorumBps() {
    if (!settings) return;
    const value = parseWholeNumber(drafts.quorumBps ?? String(settings.quorumBps));
    if (value === null) {
      setFormMessage('Quorum must be a whole number.');
      return;
    }

    if (value === settings.quorumBps) {
      setFormMessage('Quorum is unchanged.');
      return;
    }

    await submitGovernorUpdate('quorumBps', 'Quorum', async (governor) => {
      const assembled = await governor.set_quorum_bps({ caller: session.address || '', quorum_bps: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  if (!hasGovernanceAccess) {
    return (
      <DaoShell>
        <PageSection
          eyebrow="Admin"
          title="Governance Admin"
          description="Governance settings and authority management."
        >
          <Callout
            variant="warning"
            badge="Access restricted"
            title="Connect a governance authority wallet to continue"
            description="You can still view the current governor values, but only a governance authority can update them."
          >
            {settings ? (
              <Stack gap="1">
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Voting delay: {settings.votingDelay}
                </Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Voting period: {settings.votingPeriod}
                </Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Proposal threshold: {settings.proposalThreshold.toString()}
                </Text>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Quorum: {settings.quorumBps} bps
                </Text>
              </Stack>
            ) : null}
          </Callout>
        </PageSection>
      </DaoShell>
    );
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Admin"
        title="Governance Admin"
        description="Edit governor parameters and apply them one at a time."
      >
        <Stack gap="4">
          <AdminSectionNav active="/admin/governance" />

          <Card p="5">
            <Stack gap="3">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <Stack gap="3">
                  <div>
                    <Badge>Live values</Badge>
                  </div>
                  <Heading style={{ fontSize: '1.2rem' }}>Current governor settings</Heading>
                </Stack>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshSettings()}
                  disabled={settingsLoading}
                >
                  {settingsLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>

              {settingsError ? <Callout variant="error" title={settingsError.message} /> : null}
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
            </Stack>
          </Card>

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting delay</Badge>
                </div>
                <DurationInput
                  id="voting-delay"
                  label="Voting delay"
                  value={drafts.votingDelay ?? settings?.votingDelay ?? ''}
                  onChange={(seconds) => setDrafts((current) => ({ ...current, votingDelay: String(seconds) }))}
                  helperText={`Current: ${settings ? formatSecondsValue(settings.votingDelay) : '—'} · Measured in seconds.`}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyVotingDelay()}
                    disabled={
                      busy ||
                      activeAction === 'votingDelay' ||
                      !settings ||
                      parseWholeNumber(drafts.votingDelay ?? String(settings.votingDelay)) === null ||
                      (drafts.votingDelay ?? String(settings.votingDelay)) === String(settings.votingDelay)
                    }
                  >
                    {busy && activeAction === 'votingDelay' ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              </Stack>
            </Card>

            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting period</Badge>
                </div>
                <DurationInput
                  id="voting-period"
                  label="Voting period"
                  value={drafts.votingPeriod ?? settings?.votingPeriod ?? ''}
                  onChange={(seconds) => setDrafts((current) => ({ ...current, votingPeriod: String(seconds) }))}
                  helperText={`Current: ${settings ? formatSecondsValue(settings.votingPeriod) : '—'} · Measured in seconds.`}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyVotingPeriod()}
                    disabled={
                      busy ||
                      activeAction === 'votingPeriod' ||
                      !settings ||
                      parseWholeNumber(drafts.votingPeriod ?? String(settings.votingPeriod)) === null ||
                      (drafts.votingPeriod ?? String(settings.votingPeriod)) === String(settings.votingPeriod)
                    }
                  >
                    {busy && activeAction === 'votingPeriod' ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              </Stack>
            </Card>

            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Proposal threshold</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Current: {settings?.proposalThreshold?.toString() ?? '—'} votes
                </Text>
                <Input
                  value={drafts.proposalThreshold ?? formatThreshold(settings?.proposalThreshold ?? 0n)}
                  type="number"
                  min="0"
                  step="1"
                  onChange={(event) => setDrafts((current) => ({ ...current, proposalThreshold: event.target.value }))}
                  placeholder="New proposal threshold"
                />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                  {settings ? 'Apply this change in a single transaction.' : 'Loading current value...'}
                </Text>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyProposalThreshold()}
                    disabled={
                      busy ||
                      activeAction === 'proposalThreshold' ||
                      !settings ||
                      parseBigIntValue(drafts.proposalThreshold ?? formatThreshold(settings.proposalThreshold)) ===
                        null ||
                      (drafts.proposalThreshold ?? formatThreshold(settings.proposalThreshold)) ===
                        formatThreshold(settings.proposalThreshold)
                    }
                  >
                    {busy && activeAction === 'proposalThreshold' ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              </Stack>
            </Card>

            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Quorum</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Current: {settings?.quorumBps ?? '—'} bps
                </Text>
                <Input
                  value={drafts.quorumBps ?? String(settings?.quorumBps ?? '')}
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  onChange={(event) => setDrafts((current) => ({ ...current, quorumBps: event.target.value }))}
                  placeholder="New quorum bps"
                />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                  {settings ? 'Apply this change in a single transaction.' : 'Loading current value...'}
                </Text>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyQuorumBps()}
                    disabled={
                      busy ||
                      activeAction === 'quorumBps' ||
                      !settings ||
                      parseWholeNumber(drafts.quorumBps ?? String(settings.quorumBps)) === null ||
                      (drafts.quorumBps ?? String(settings.quorumBps)) === String(settings.quorumBps)
                    }
                  >
                    {busy && activeAction === 'quorumBps' ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              </Stack>
            </Card>
          </Grid>

          <AuthorityPanel
            title="Governor authorities"
            badge="Governance"
            description="Current wallets explicitly allowed to manage governance settings. The owner is always included."
            items={governorAuthorities?.items ?? []}
            value=""
            allowLabel=""
            revokeLabel=""
            editable={false}
            busy={authorityLoading}
            emptyLabel={authorityError?.message || 'No governance authorities indexed yet.'}
          />
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
