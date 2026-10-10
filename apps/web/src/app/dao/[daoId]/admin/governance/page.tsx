'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { type SignTransaction } from '@stellar/stellar-sdk/contract';
import { useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminValueForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSurfaceNav as AdminSectionNav } from '@/components/admin/admin-surface-nav';
import { DurationInput } from '@/components/admin/duration-input';
import { PercentageInput } from '@/components/admin/percentage-input';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner, useGovernorSettings } from '@/lib/admin-queries';
import { formatDuration } from '@/lib/format-duration';
import {
  validateProposalThreshold,
  validateQueueDelay,
  validateQuorumBps,
  validateVotingDelay,
  validateVotingPeriod
} from '@/lib/governance-limits';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type Drafts = Partial<{
  votingDelay: number;
  votingPeriod: number;
  proposalThreshold: string;
  quorumBps: number;
  queueDelay: number;
}>;

type GovernorSettingKey = 'votingDelay' | 'votingPeriod' | 'proposalThreshold' | 'quorumBps' | 'queueDelay';

const EMPTY_DRAFTS: Drafts = {};

function formatThreshold(value: bigint) {
  return value.toString();
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
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<GovernorSettingKey | ''>('');
  const proposalDraft = useAdminProposalDraft();
  const draftStatus = useAdminDraftStatus(daoId, [
    'set-voting-delay',
    'set-voting-period',
    'set-proposal-threshold',
    'set-quorum-bps',
    'set-queue-delay'
  ]);
  const tx = useTransactionFeedback(config.name);
  const {
    data: settings,
    mutate: refreshSettings,
    error: settingsError,
    isLoading: settingsLoading
  } = useGovernorSettings(
    config,
    session.address || (config.status === 'pending' ? config.launchAdmin : config.adminAddress)
  );
  const { data: governorOwner } = useContractOwner(config, 'governor', session.address || config.adminAddress);
  const isOwner = Boolean(session.address && governorOwner === session.address);
  // The governor owner is the launch admin before launch and the Treasury afterwards.
  // There is no separate governor-authority role any more.
  const hasGovernanceAccess = isOwner;
  const canProposeGovernance = Boolean(session.address && treasuryIsOwner(config, governorOwner));

  function proposeSetting(
    type: 'set-voting-delay' | 'set-voting-period' | 'set-proposal-threshold' | 'set-quorum-bps' | 'set-queue-delay',
    value: string,
    label: string
  ) {
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    ) {
      setFormMessage('Switch your wallet to the DAO network before preparing a governance update.');
      return;
    }
    const handler = getActionHandler(type);
    const action = handler.serialize(
      { value },
      { config, session: { address: session.address, kit: StellarWalletsKit } }
    );
    proposalDraft.requestAddBatch({
      daoId,
      requests: [
        {
          daoId,
          action,
          source: `admin/governance/${type}`,
          metadata: {
            title: `Update ${label.toLowerCase()}`,
            description: `Update the DAO ${label.toLowerCase()} to ${value}.`,
            url: ''
          }
        }
      ],
      onAdded: () => setFormMessage(`${label} added to the proposal draft.`)
    });
  }

  async function getGovernor() {
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    )
      throw new Error('Switch your wallet to the DAO network before signing.');
    if (!session.address) {
      throw new Error('Connect the governor owner wallet first.');
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
      setFormMessage('Connect the governor owner wallet first.');
      return;
    }

    if (!session.address) {
      setFormMessage('Connect the governor owner wallet first.');
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
      await refreshSettings();
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
    const value = typeof drafts.votingDelay === 'number' ? drafts.votingDelay : settings.votingDelay;

    if (value === settings.votingDelay) {
      setFormMessage('Voting delay is unchanged.');
      return;
    }

    const delayError = validateVotingDelay(value);
    if (delayError) {
      setFormMessage(delayError);
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-voting-delay', String(value), 'voting delay');
      return;
    }

    await submitGovernorUpdate('votingDelay', 'Voting delay', async (governor) => {
      const assembled = await governor.set_voting_delay({ voting_delay: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  async function applyVotingPeriod() {
    if (!settings) return;
    const value = typeof drafts.votingPeriod === 'number' ? drafts.votingPeriod : settings.votingPeriod;

    if (value === settings.votingPeriod) {
      setFormMessage('Voting period is unchanged.');
      return;
    }

    const periodError = validateVotingPeriod(value);
    if (periodError) {
      setFormMessage(periodError);
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-voting-period', String(value), 'voting period');
      return;
    }

    await submitGovernorUpdate('votingPeriod', 'Voting period', async (governor) => {
      const assembled = await governor.set_voting_period({ voting_period: value });
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

    const thresholdError = validateProposalThreshold(value);
    if (thresholdError) {
      setFormMessage(thresholdError);
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-proposal-threshold', value.toString(), 'proposal threshold');
      return;
    }

    await submitGovernorUpdate('proposalThreshold', 'Proposal threshold', async (governor) => {
      const assembled = await governor.set_proposal_threshold({ proposal_threshold: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  async function applyQuorumBps() {
    if (!settings) return;
    const value = typeof drafts.quorumBps === 'number' ? drafts.quorumBps : settings.quorumBps;

    if (value === settings.quorumBps) {
      setFormMessage('Quorum is unchanged.');
      return;
    }

    const quorumError = validateQuorumBps(value);
    if (quorumError) {
      setFormMessage(quorumError);
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-quorum-bps', String(value), 'quorum');
      return;
    }

    await submitGovernorUpdate('quorumBps', 'Quorum', async (governor) => {
      const assembled = await governor.set_quorum_bps({ quorum_bps: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  async function applyQueueDelay() {
    const value = drafts.queueDelay;
    if (value === undefined) return setFormMessage('Enter the desired queue delay.');
    const error = validateQueueDelay(value);
    if (error) return setFormMessage(error);
    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-queue-delay', String(value), 'Queue delay');
      return;
    }
    await submitGovernorUpdate('queueDelay', 'Queue delay', async (governor) => {
      const sent = await (await governor.set_queue_delay({ queue_delay: value })).signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  if (!hasGovernanceAccess && !canProposeGovernance) {
    return (
      <PageSection title="Governance Admin" description="Governance settings.">
        <AdminSectionNav daoId={daoId} active="/governance" />
        {settingsError ? (
          <Callout variant="error" title="Governor values unavailable" description={settingsError.message} />
        ) : null}
        <Callout
          variant="warning"
          badge="Access restricted"
          title="Connect a wallet to prepare governance updates"
          description="The current Governor owner applies setup changes. After launch, Treasury-owned changes go through a governance proposal."
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
              <Text>Queue delay: current value is unavailable in the public ABI.</Text>
            </Stack>
          ) : null}
        </Callout>
      </PageSection>
    );
  }

  return (
    <>
      <AdminProposalDraftDialog
        pending={proposalDraft.pending}
        onCancel={proposalDraft.cancel}
        onResolve={proposalDraft.resolve}
      />
      <PageSection title="Governance Admin" description="Edit governor parameters and apply them one at a time.">
        <Stack gap="4">
          <AdminSectionNav daoId={daoId} active="/governance" />

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
              {formMessage ? (
                <div role="status">
                  <Callout variant="warning" title={formMessage} />
                </div>
              ) : null}
            </Stack>
          </Card>

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <Card p="5">
              <Stack gap="3">
                <Heading style={{ fontSize: '1.2rem' }}>Queue delay</Heading>
                <Text>
                  Current value unavailable: the public Governor ABI exposes a setter but no queue-delay getter. Enter
                  the desired value explicitly.
                </Text>
                <DurationInput
                  id="queue-delay"
                  label="Execution queue delay"
                  value={drafts.queueDelay ?? 300}
                  onChange={(value) => setDrafts((current) => ({ ...current, queueDelay: value }))}
                  disabled={busy}
                  helperText="Waiting time between queueing a successful proposal and execution. Between 5 minutes and 30 days."
                />
                <Button
                  type="button"
                  onClick={() => void applyQueueDelay()}
                  disabled={busy || drafts.queueDelay === undefined}
                >
                  {busy && activeAction === 'queueDelay'
                    ? 'Applying…'
                    : hasGovernanceAccess
                      ? 'Apply queue delay'
                      : 'Add to proposal'}
                </Button>
              </Stack>
            </Card>
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting delay</Badge>
                </div>
                <Stack gap="1">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Current: {settings ? formatSecondsValue(settings.votingDelay) : '—'}
                  </Text>
                </Stack>
                <DurationInput
                  id="voting-delay"
                  label="Enter voting delay"
                  value={drafts.votingDelay ?? settings?.votingDelay ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, votingDelay: value }))}
                  disabled={busy}
                  helperText="Time between proposal creation and when voting begins. Between 5 minutes and 30 days. Example: 1 day gives members time to see new proposals."
                />
                <Stack gap="1">
                  {typeof drafts.votingDelay === 'number' && settings && drafts.votingDelay !== settings.votingDelay ? (
                    <Text className="lede" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent)' }}>
                      Change: {formatSecondsValue(settings.votingDelay)} → {formatSecondsValue(drafts.votingDelay)}
                    </Text>
                  ) : null}
                </Stack>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyVotingDelay()}
                    disabled={
                      busy ||
                      activeAction === 'votingDelay' ||
                      !settings ||
                      (typeof drafts.votingDelay === 'number' ? drafts.votingDelay : settings.votingDelay) ===
                        settings.votingDelay
                    }
                  >
                    {busy && activeAction === 'votingDelay'
                      ? 'Applying...'
                      : hasGovernanceAccess
                        ? 'Apply'
                        : 'Add to proposal'}
                  </Button>
                </div>
              </Stack>
            </Card>

            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting period</Badge>
                </div>
                <Stack gap="1">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Current: {settings ? formatSecondsValue(settings.votingPeriod) : '—'}
                  </Text>
                </Stack>
                <DurationInput
                  id="voting-period"
                  label="Enter voting period"
                  value={drafts.votingPeriod ?? settings?.votingPeriod ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, votingPeriod: value }))}
                  disabled={busy}
                  helperText="How long voting remains open after it starts. Between 5 minutes and 30 days. Longer periods allow more participation. Common: 3-7 days."
                />
                <Stack gap="1">
                  {typeof drafts.votingPeriod === 'number' &&
                  settings &&
                  drafts.votingPeriod !== settings.votingPeriod ? (
                    <Text className="lede" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent)' }}>
                      Change: {formatSecondsValue(settings.votingPeriod)} → {formatSecondsValue(drafts.votingPeriod)}
                    </Text>
                  ) : null}
                </Stack>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyVotingPeriod()}
                    disabled={
                      busy ||
                      activeAction === 'votingPeriod' ||
                      !settings ||
                      (typeof drafts.votingPeriod === 'number' ? drafts.votingPeriod : settings.votingPeriod) ===
                        settings.votingPeriod
                    }
                  >
                    {busy && activeAction === 'votingPeriod'
                      ? 'Applying...'
                      : hasGovernanceAccess
                        ? 'Apply'
                        : 'Add to proposal'}
                  </Button>
                </div>
              </Stack>
            </Card>

            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Proposal threshold</Badge>
                </div>
                <Stack gap="1">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Current:{' '}
                    {settings ? (
                      `${settings.proposalThreshold.toString()} votes`
                    ) : (
                      <Skeleton className="skeleton--inline" style={{ width: '90px', height: '1em' }} />
                    )}
                  </Text>
                </Stack>
                {/* Draft preview shows when this setting change is already in the proposal queue.
                    This prevents users from accidentally queuing the same change twice, since admin
                    users interact with isolated settings one at a time (unlike proposal creation
                    where the full queue is always visible below). */}
                <AdminValueForm
                  value={{ value: drafts.proposalThreshold ?? formatThreshold(settings?.proposalThreshold ?? 0n) }}
                  onChange={(value) => setDrafts((current) => ({ ...current, proposalThreshold: value.value }))}
                  disabled={busy}
                  draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-proposal-threshold')}
                />
                <Stack gap="1">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                    {settings ? (
                      'Absolute number of votes (at least 1) required to create a proposal. Higher values prevent spam.'
                    ) : (
                      <Skeleton style={{ width: '210px', height: '0.8em' }} />
                    )}
                  </Text>
                  {settings &&
                  drafts.proposalThreshold &&
                  drafts.proposalThreshold !== formatThreshold(settings.proposalThreshold) ? (
                    <Text className="lede" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent)' }}>
                      Change: {formatThreshold(settings.proposalThreshold)} → {drafts.proposalThreshold} votes
                    </Text>
                  ) : null}
                </Stack>
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
                    {busy && activeAction === 'proposalThreshold'
                      ? 'Applying...'
                      : hasGovernanceAccess
                        ? 'Apply'
                        : 'Add to proposal'}
                  </Button>
                </div>
              </Stack>
            </Card>

            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Quorum</Badge>
                </div>
                <Stack gap="1">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Current:{' '}
                    {settings ? (
                      `${(settings.quorumBps / 100).toFixed(2)}%`
                    ) : (
                      <Skeleton className="skeleton--inline" style={{ width: '80px', height: '1em' }} />
                    )}
                  </Text>
                </Stack>
                <PercentageInput
                  id="quorum-bps"
                  label="Enter quorum percentage"
                  value={drafts.quorumBps ?? settings?.quorumBps ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, quorumBps: value }))}
                  disabled={busy}
                  helperText="Percentage of total votes needed for a proposal to pass. Example: 10% means 10 out of 100 votes required."
                />
                <Stack gap="1">
                  {typeof drafts.quorumBps === 'number' && settings && drafts.quorumBps !== settings.quorumBps ? (
                    <Text className="lede" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent)' }}>
                      Change: {(settings.quorumBps / 100).toFixed(2)}% → {(drafts.quorumBps / 100).toFixed(2)}%
                    </Text>
                  ) : null}
                </Stack>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyQuorumBps()}
                    disabled={
                      busy ||
                      activeAction === 'quorumBps' ||
                      !settings ||
                      (typeof drafts.quorumBps === 'number' ? drafts.quorumBps : settings.quorumBps) ===
                        settings.quorumBps
                    }
                  >
                    {busy && activeAction === 'quorumBps'
                      ? 'Applying...'
                      : hasGovernanceAccess
                        ? 'Apply'
                        : 'Add to proposal'}
                  </Button>
                </div>
              </Stack>
            </Card>
          </Grid>
        </Stack>
      </PageSection>
    </>
  );
}
