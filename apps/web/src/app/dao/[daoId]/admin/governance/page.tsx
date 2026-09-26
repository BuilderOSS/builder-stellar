'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { type SignTransaction } from '@stellar/stellar-sdk/contract';
import { useState } from 'react';
import { Grid, Stack } from 'styled-system/jsx';

import { AdminValueForm } from '@/components/admin/admin-action-forms';
import { AdminProposalDraftDialog } from '@/components/admin/admin-proposal-draft-dialog';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { DurationInput } from '@/components/admin/duration-input';
import { PercentageInput } from '@/components/admin/percentage-input';
import { PageSection } from '@/components/page-section';
import { Badge, Button, Callout, Card, Heading, Skeleton, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryHasAuthority, treasuryIsOwner } from '@/lib/admin-proposals';
import { useContractOwner, useGovernorSettings } from '@/lib/admin-queries';
import { formatDuration } from '@/lib/format-duration';
import { useGoldskyGovernorAuthorities } from '@/lib/goldsky-queries';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useAdminProposalDraft } from '@/lib/use-admin-proposal-draft';
import { useAdminDraftStatus } from '@/lib/use-admin-draft-status';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type Drafts = Partial<{
  votingDelay: number;
  votingPeriod: number;
  proposalThreshold: string;
  quorumBps: number;
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
  const { daoId, daoConfig: config } = useDaoContext();
  const session = useDaoSessionStore();
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<GovernorSettingKey | ''>('');
  const proposalDraft = useAdminProposalDraft();
  const draftStatus = useAdminDraftStatus(daoId, [
    'set-voting-delay',
    'set-voting-period',
    'set-proposal-threshold',
    'set-quorum-bps'
  ]);
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
  } = useGoldskyGovernorAuthorities(config.tokenContractId);
  const { data: governorOwner } = useContractOwner(config, 'governor', session.address || undefined);
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasGovernanceAccess = Boolean(
    isOwner || governorAuthorities?.items.some((item) => item.authority === session.address)
  );
  const canProposeGovernance = Boolean(
    session.address &&
    (treasuryIsOwner(config, governorOwner) ||
      treasuryHasAuthority(config.treasuryContractId, governorAuthorities?.items))
  );

  function proposeSetting(
    type: 'set-voting-delay' | 'set-voting-period' | 'set-proposal-threshold' | 'set-quorum-bps',
    value: string,
    label: string
  ) {
    const handler = getActionHandler(type);
    const action = handler.serialize(
      { value },
      { config, session: { address: session.address, kit: StellarWalletsKit } }
    );
    proposalDraft.requestAdd({
      daoId,
      action,
      source: `admin/governance/${type}`,
      metadata: {
        title: `Update ${label.toLowerCase()}`,
        description: `Update the DAO ${label.toLowerCase()} to ${value}.`,
        url: ''
      },
      onAdded: () => setFormMessage(`${label} added to the proposal draft.`)
    });
  }

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
    const value = typeof drafts.votingDelay === 'number' ? drafts.votingDelay : settings.votingDelay;

    if (value === settings.votingDelay) {
      setFormMessage('Voting delay is unchanged.');
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-voting-delay', String(value), 'voting delay');
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
    const value = typeof drafts.votingPeriod === 'number' ? drafts.votingPeriod : settings.votingPeriod;

    if (value === settings.votingPeriod) {
      setFormMessage('Voting period is unchanged.');
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-voting-period', String(value), 'voting period');
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

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-proposal-threshold', value.toString(), 'proposal threshold');
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
    const value = typeof drafts.quorumBps === 'number' ? drafts.quorumBps : settings.quorumBps;

    if (value === settings.quorumBps) {
      setFormMessage('Quorum is unchanged.');
      return;
    }

    if (!hasGovernanceAccess && canProposeGovernance) {
      proposeSetting('set-quorum-bps', String(value), 'quorum');
      return;
    }

    await submitGovernorUpdate('quorumBps', 'Quorum', async (governor) => {
      const assembled = await governor.set_quorum_bps({ caller: session.address || '', quorum_bps: value });
      const sent = await assembled.signAndSend();
      return sent.sendTransactionResponse?.hash ?? '';
    });
  }

  if (!hasGovernanceAccess && !canProposeGovernance) {
    return (
      <PageSection title="Governance Admin" description="Governance settings and authority management.">
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
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
            </Stack>
          </Card>

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting delay</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Current: {settings ? formatSecondsValue(settings.votingDelay) : '—'}
                </Text>
                <DurationInput
                  id="voting-delay"
                  label="Enter voting delay"
                  value={drafts.votingDelay ?? settings?.votingDelay ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, votingDelay: value }))}
                  disabled={busy}
                  helperText="Time between proposal creation and when voting begins. Minimum 5 minutes. Example: 1 day gives members time to see new proposals."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyVotingDelay()}
                    disabled={
                      busy ||
                      activeAction === 'votingDelay' ||
                      !settings ||
                      (typeof drafts.votingDelay === 'number' ? drafts.votingDelay : settings.votingDelay) === settings.votingDelay
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
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Current: {settings ? formatSecondsValue(settings.votingPeriod) : '—'}
                </Text>
                <DurationInput
                  id="voting-period"
                  label="Enter voting period"
                  value={drafts.votingPeriod ?? settings?.votingPeriod ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, votingPeriod: value }))}
                  disabled={busy}
                  helperText="How long voting remains open after it starts. Minimum 1 day. Longer periods allow more participation. Common: 3-7 days."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyVotingPeriod()}
                    disabled={
                      busy ||
                      activeAction === 'votingPeriod' ||
                      !settings ||
                      (typeof drafts.votingPeriod === 'number' ? drafts.votingPeriod : settings.votingPeriod) === settings.votingPeriod
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
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Current:{' '}
                  {settings ? (
                    `${settings.proposalThreshold.toString()} votes`
                  ) : (
                    <Skeleton className="skeleton--inline" style={{ width: '90px', height: '1em' }} />
                  )}
                </Text>
                <AdminValueForm
                  value={{ value: drafts.proposalThreshold ?? formatThreshold(settings?.proposalThreshold ?? 0n) }}
                  onChange={(value) => setDrafts((current) => ({ ...current, proposalThreshold: value.value }))}
                  disabled={busy}
                  draftPreview={draftStatus.actionsInDraft.find((a) => a.type === 'set-proposal-threshold')}
                />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>
                  {settings ? (
                    'Minimum voting power required to create a proposal. Higher values prevent spam.'
                  ) : (
                    <Skeleton style={{ width: '210px', height: '0.8em' }} />
                  )}
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
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Current:{' '}
                  {settings ? (
                    `${(settings.quorumBps / 100).toFixed(2)}%`
                  ) : (
                    <Skeleton className="skeleton--inline" style={{ width: '80px', height: '1em' }} />
                  )}
                </Text>
                <PercentageInput
                  id="quorum-bps"
                  label="Enter quorum percentage"
                  value={drafts.quorumBps ?? settings?.quorumBps ?? 0}
                  onChange={(value) => setDrafts((current) => ({ ...current, quorumBps: value }))}
                  disabled={busy}
                  helperText="Percentage of total votes needed for a proposal to pass. Example: 10% means 10 out of 100 votes required."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    onClick={() => void applyQuorumBps()}
                    disabled={
                      busy ||
                      activeAction === 'quorumBps' ||
                      !settings ||
                      (typeof drafts.quorumBps === 'number' ? drafts.quorumBps : settings.quorumBps) === settings.quorumBps
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

          <AuthorityPanel
            title="Governor authorities"
            badge="Governance"
            description="Current wallets explicitly allowed to manage governance settings. The owner is always included."
            items={governorAuthorities?.items ?? []}
            value=""
            allowLabel=""
            revokeLabel=""
            editable={false}
            loading={authorityLoading}
            busy={authorityLoading}
            emptyLabel={authorityError?.message || 'No governance authorities indexed yet.'}
          />
        </Stack>
      </PageSection>
    </>
  );
}
