'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { type SignTransaction } from '@stellar/stellar-sdk/contract';
import { useState } from 'react';
import { css } from 'styled-system/css';
import { Grid, Stack } from 'styled-system/jsx';

import type { AdminValueDraft } from '@/components/admin/admin-action-forms';
import { PageSection } from '@/components/page-section';
import { SettingChangeCard } from '@/components/proposal-changes/setting-change-card';
import { Badge, Button, Callout, Card, Heading, Text } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { treasuryIsAdmin } from '@/lib/admin-proposals';
import { useContractAdmin, useGovernorSettings } from '@/lib/admin-queries';
import { formatDuration } from '@/lib/duration';
import { getActionMeta } from '@/lib/proposal-changes/catalog';
import { restoreArchivedState } from '@/lib/restore-archived-client';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type GovernorSettingType =
  'set-voting-delay' | 'set-voting-period' | 'set-proposal-threshold' | 'set-quorum-bps' | 'set-queue-delay';

/** The rules in the order members think about them, with what each card is called. */
const RULES: Array<{ type: GovernorSettingType; title: string }> = [
  { type: 'set-voting-delay', title: 'Wait before voting opens' },
  { type: 'set-voting-period', title: 'Voting period' },
  { type: 'set-proposal-threshold', title: 'Votes needed to propose' },
  { type: 'set-quorum-bps', title: 'Quorum' },
  { type: 'set-queue-delay', title: 'Safety delay' }
];

function formatSecondsValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? formatDuration(value) : '—';
}

/** The Setup call for one rule, signed by the launch admin. */
function directCall(governor: GovernorClient, type: GovernorSettingType, value: string) {
  switch (type) {
    case 'set-voting-delay':
      return governor.set_voting_delay({ voting_delay: Number(value) });
    case 'set-voting-period':
      return governor.set_voting_period({ voting_period: Number(value) });
    case 'set-proposal-threshold':
      return governor.set_proposal_threshold({ proposal_threshold: BigInt(value) });
    case 'set-quorum-bps':
      return governor.set_quorum_bps({ quorum_bps: Number(value) });
    case 'set-queue-delay':
      return governor.set_queue_delay({ queue_delay: Number(value) });
  }
}

export default function GovernanceAdminPage() {
  const { daoConfig: config } = useDaoContext();
  const session = useAuthSessionStore();
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<GovernorSettingType | ''>('');
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

  async function getGovernor() {
    if (
      session.walletNetworkIssue ||
      (session.walletNetworkPassphrase && session.walletNetworkPassphrase !== config.passphrase)
    )
      throw new Error('Switch your wallet to this tribe’s network first.');
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

  async function apply(type: GovernorSettingType, title: string, value: string) {
    if (!hasGovernanceAccess || !session.address) return;
    setBusy(true);
    setActiveAction(type);
    tx.start(`Applying ${title.toLowerCase()}`);
    try {
      const governor = await getGovernor();
      const sent = await (await directCall(governor, type, value)).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted(`${title} submitted`, hash);
      await waitForConfirmation(hash, config.rpcUrl);
      await refreshSettings();
      tx.success(`${title} updated`, hash);
    } catch (error) {
      tx.fail(error, `${title} update failed`);
    } finally {
      setBusy(false);
      setActiveAction('');
    }
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
    <PageSection
      title="Voting rules"
      description={
        hasGovernanceAccess
          ? 'Setup: change one rule at a time, directly.'
          : 'Requires DAO governance: change one rule at a time. Each change goes up for a vote.'
      }
    >
      <Stack gap="4">
        <Card p="5">
          <Stack gap="3">
            <div className={css({ display: 'flex', justifyContent: 'space-between', gap: '3', flexWrap: 'wrap' })}>
              <Stack gap="3">
                <div>
                  <Badge tone="live">Live values</Badge>
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
            {settings?.queueDelay === undefined ? (
              <Text size="sm">
                The safety delay can&apos;t be read from the contract yet, so enter the delay you want.
              </Text>
            ) : null}
          </Stack>
        </Card>

        <Grid columns={{ base: 1, xl: 2 }} gap="4">
          {RULES.map((rule) => (
            <SettingChangeCard<AdminValueDraft>
              key={rule.type}
              type={rule.type}
              title={rule.title}
              current={
                (getActionMeta(rule.type).currentValue?.({ governor: settings }) ?? null) as {
                  draft: AdminValueDraft;
                  text: string;
                } | null
              }
              direct={hasGovernanceAccess}
              canAct={Boolean(settings) || rule.type === 'set-queue-delay'}
              busy={busy}
              loading={busy && activeAction === rule.type}
              onApply={(draft) => apply(rule.type, rule.title, draft.value.trim())}
            />
          ))}
        </Grid>
      </Stack>
    </PageSection>
  );
}
