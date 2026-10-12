'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { type SignTransaction } from '@stellar/stellar-sdk/contract';
import { useState } from 'react';
import { css, cx } from 'styled-system/css';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminValueForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { DurationInput } from '@/components/admin/duration-input';
import { PercentageInput } from '@/components/admin/percentage-input';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin, useGovernorSettings } from '@/lib/admin-queries';
import { formatDuration } from '@/lib/duration';
import {
  validateProposalThreshold,
  validateQueueDelay,
  validateQuorumBps,
  validateVotingDelay,
  validateVotingPeriod
} from '@/lib/governance-limits';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { signWithWallet } from '@/lib/wallet-sign';
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
  } = useGovernorSettings(config, session.address || config.launchAdmin, true);
  const { data: governorAdmin } = useContractAdmin(config, 'governor', session.address || config.launchAdmin);
  const isAdmin = Boolean(session.address && governorAdmin === session.address);
  // The governor admin is the launch admin before launch and the Treasury afterwards.
  // There is no separate governor-authority role any more.
  const hasGovernanceAccess = isAdmin;
  const canProposeGovernance = Boolean(session.address && treasuryIsAdmin(config, governorAdmin));

  function proposeSetting(
    type: 'set-voting-delay' | 'set-voting-period' | 'set-proposal-threshold' | 'set-quorum-bps' | 'set-queue-delay',
    value: string,
    label: string
  ) {
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    ) {
      setFormMessage('Switch your wallet to this community’s network first.');
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
            description: `Change the ${label.toLowerCase()} to ${value}.`,
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
      throw new Error('Switch your wallet to this community’s network first.');
    if (!session.address) {
      throw new Error('Connect the launch admin wallet first.');
    }

    if (!config.governorContractId) {
      throw new Error('Missing governor contract id in the active network config.');
    }

    return new GovernorClient({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: session.address,
      ...restoreArchivedState,
      signTransaction: (async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
        signWithWallet(xdr, {
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
      setFormMessage('Connect the launch admin wallet first.');
      return;
    }

    if (!session.address) {
      setFormMessage('Connect the launch admin wallet first.');
      return;
    }

    if (!config.governorContractId) {
      setFormMessage('Missing governor contract id in the active network config.');
      return;
    }

    setBusy(true);
    setActiveAction(action);
    setFormMessage('');
    tx.start(`Applying ${label.toLowerCase()}…`);

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
    if (value === undefined) return setFormMessage('Enter a safety delay.');
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
      <PageSection title="Voting rules" description="How proposals are timed and decided.">
        {settingsError ? (
          <Callout variant="error" title="Voting rules didn't load" description={settingsError.message} />
        ) : null}
        <Callout
          variant="warning"
          badge="Access restricted"
          title="Connect a wallet to change voting rules"
          description="During setup, the launch admin changes these directly. After launch, each change goes to a vote."
        >
          {settings ? (
            <Stack gap="1">
              <Text size="sm">Wait before voting opens: {formatSecondsValue(settings.votingDelay)}</Text>
              <Text size="sm">Voting stays open: {formatSecondsValue(settings.votingPeriod)}</Text>
              <Text size="sm">Votes needed to propose: {settings.proposalThreshold.toString()}</Text>
              <Text size="sm">Quorum: {settings.quorumBps / 100}%</Text>
              <Text size="sm">
                Safety delay:{' '}
                {settings.queueDelay === undefined ? 'not available yet' : formatSecondsValue(settings.queueDelay)}
              </Text>
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
      <PageSection
        title="Voting rules"
        description="Change one rule at a time. After launch, each change goes up for a vote."
      >
        <Stack gap="4">
          <Card p="5">
            <Stack gap="3">
              <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '3', flexWrap: 'wrap' })}>
                <Stack gap="3">
                  <div>
                    <Badge>Live values</Badge>
                  </div>
                  <Heading size="heading">Current rules</Heading>
                </Stack>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshSettings()}
                  disabled={settingsLoading}
                >
                  {settingsLoading ? 'Refreshing…' : 'Refresh'}
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
                <Heading size="heading">Safety delay</Heading>
                <Text>The current value can&apos;t be read from the contract, so enter the delay you want.</Text>
                <DurationInput
                  id="queue-delay"
                  label="Safety delay"
                  value={drafts.queueDelay ?? 300}
                  onChange={(value) => setDrafts((current) => ({ ...current, queueDelay: value }))}
                  disabled={busy}
                  helperText="How long a passed proposal waits after it’s queued before it can run. Between 5 minutes and 30 days."
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
                  <Text size="sm">Current: {settings ? formatSecondsValue(settings.votingDelay) : '—'}</Text>
                </Stack>
                <DurationInput
                  id="voting-delay"
                  label="Enter voting delay"
                  value={drafts.votingDelay ?? settings?.votingDelay ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, votingDelay: value }))}
                  disabled={busy}
                  helperText="How long after a proposal is made before voting opens. Between 5 minutes and 30 days. A day gives members time to read it."
                />
                <Stack gap="1">
                  {typeof drafts.votingDelay === 'number' && settings && drafts.votingDelay !== settings.votingDelay ? (
                    <Text size="sm" color="signal">
                      Change: {formatSecondsValue(settings.votingDelay)} → {formatSecondsValue(drafts.votingDelay)}
                    </Text>
                  ) : null}
                </Stack>
                <div className={css({ display: 'flex', justifyContent: 'flex-end' })}>
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
                      ? 'Applying…'
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
                  <Text size="sm">Current: {settings ? formatSecondsValue(settings.votingPeriod) : '—'}</Text>
                </Stack>
                <DurationInput
                  id="voting-period"
                  label="Enter voting period"
                  value={drafts.votingPeriod ?? settings?.votingPeriod ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, votingPeriod: value }))}
                  disabled={busy}
                  helperText="How long voting stays open. Between 5 minutes and 30 days. Longer windows let more members take part; 3 to 7 days is common."
                />
                <Stack gap="1">
                  {typeof drafts.votingPeriod === 'number' &&
                  settings &&
                  drafts.votingPeriod !== settings.votingPeriod ? (
                    <Text size="sm" color="signal">
                      Change: {formatSecondsValue(settings.votingPeriod)} → {formatSecondsValue(drafts.votingPeriod)}
                    </Text>
                  ) : null}
                </Stack>
                <div className={css({ display: 'flex', justifyContent: 'flex-end' })}>
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
                      ? 'Applying…'
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
                  <Text size="sm">
                    Current:{' '}
                    {settings ? (
                      `${settings.proposalThreshold.toString()} votes`
                    ) : (
                      <Skeleton
                        className={cx(
                          css({ display: 'inline-block', verticalAlign: 'middle', width: '90px', height: '1em' })
                        )}
                      />
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
                  <Text size="sm">
                    {settings ? (
                      'How many votes someone needs to make a proposal (at least 1). Higher numbers cut down on spam.'
                    ) : (
                      <Skeleton className={css({ width: '210px', height: '0.8em' })} />
                    )}
                  </Text>
                  {settings &&
                  drafts.proposalThreshold &&
                  drafts.proposalThreshold !== formatThreshold(settings.proposalThreshold) ? (
                    <Text size="sm" color="signal">
                      Change: {formatThreshold(settings.proposalThreshold)} → {drafts.proposalThreshold} votes
                    </Text>
                  ) : null}
                </Stack>
                <div className={css({ display: 'flex', justifyContent: 'flex-end' })}>
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
                      ? 'Applying…'
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
                  <Text size="sm">
                    Current:{' '}
                    {settings ? (
                      `${(settings.quorumBps / 100).toFixed(2)}%`
                    ) : (
                      <Skeleton
                        className={cx(
                          css({ display: 'inline-block', verticalAlign: 'middle', width: '80px', height: '1em' })
                        )}
                      />
                    )}
                  </Text>
                </Stack>
                <PercentageInput
                  id="quorum-bps"
                  label="Enter quorum percentage"
                  value={drafts.quorumBps ?? settings?.quorumBps ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, quorumBps: value }))}
                  disabled={busy}
                  helperText="Share of all votes that must be For or Abstain for a proposal to pass. Example: with 100 votes, 10% means at least 10."
                />
                <Stack gap="1">
                  {typeof drafts.quorumBps === 'number' && settings && drafts.quorumBps !== settings.quorumBps ? (
                    <Text size="sm" color="signal">
                      Change: {(settings.quorumBps / 100).toFixed(2)}% → {(drafts.quorumBps / 100).toFixed(2)}%
                    </Text>
                  ) : null}
                </Stack>
                <div className={css({ display: 'flex', justifyContent: 'flex-end' })}>
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
                      ? 'Applying…'
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
