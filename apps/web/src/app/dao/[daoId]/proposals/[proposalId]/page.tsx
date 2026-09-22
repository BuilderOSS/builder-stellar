'use client';

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { ProposalActionPreview } from '@/components/proposal/proposal-action-preview';
import { ProposalExecutePanel } from '@/components/proposal/proposal-execute-panel';
import { ProposalLifecyclePanel, ProposalOverview } from '@/components/proposal/proposal-overview';
import { ProposalQueuePanel } from '@/components/proposal/proposal-queue-panel';
import { ProposalVoteHistory } from '@/components/proposal/proposal-vote-history';
import { ProposalVotePanel } from '@/components/proposal/proposal-vote-panel';
import { ProposalVoteSummary } from '@/components/proposal/proposal-vote-summary';
import type { ProposalDetail, ProposalVoteItem } from '@/components/proposal/types';
import { Button, Callout } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { keccak256Bytes } from '@/lib/keccak';
import { encodeProposalCallArgs } from '@/lib/proposal-call';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { proposalActionMode } from '@/lib/proposal-state';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useVotingPower } from '@/lib/voting-power';
import { useDaoSessionStore } from '@/stores/dao-session-store';

type ProposalPageData = {
  detail: ProposalDetail;
  votes: ProposalVoteItem[];
};

const VOTE_FOR = 1;
const VOTE_AGAINST = 0;
// const VOTE_ABSTAIN = 2;

function descriptionHash(description: string) {
  return keccak256Bytes(description);
}

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

function shortenProposalId(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

async function fetchProposalPageData([, proposalId]: readonly ['proposal-detail', string]): Promise<ProposalPageData> {
  const [detailResponse, votesResponse] = await Promise.all([
    fetch(`/api/proposals/${proposalId}`, { cache: 'no-store' }),
    fetch(`/api/proposals/${proposalId}/votes`, { cache: 'no-store' })
  ]);

  if (!detailResponse.ok) {
    throw new Error((await detailResponse.json()).message || 'Proposal lookup failed');
  }

  if (!votesResponse.ok) {
    throw new Error((await votesResponse.json()).message || 'Vote lookup failed');
  }

  const detail = (await detailResponse.json()) as ProposalDetail;
  const votesPayload = (await votesResponse.json()) as { items?: ProposalVoteItem[] };

  return { detail, votes: votesPayload.items ?? [] };
}

export default function ProposalDetailPage() {
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [voteReason, setVoteReason] = useState('');
  const [selectedVoteType, setSelectedVoteType] = useState<number | null>(null);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = useTransactionFeedback(config.name);
  const [now, setNow] = useState(() => Date.now());

  const { data, error, isLoading, mutate } = useSWR(
    proposalId ? (['proposal-detail', proposalId] as const) : null,
    fetchProposalPageData,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );

  const detail = data?.detail ?? null;
  const votes = data?.votes ?? [];
  const {
    data: votingPower,
    error: votingPowerError,
    isLoading: votingPowerLoading
  } = useVotingPower(config, detail ? session.address : '', detail?.vote_snapshot);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function getGovernor() {
    if (!session.address) throw new Error('Connect a wallet first.');
    if (!config.governorContractId) throw new Error('Missing governor contract id.');

    return new GovernorClient({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: session.address,
      signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
        StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
          address: opts?.address ?? session.address
        })
    });
  }

  async function submitVote(voteType: number) {
    if (!detail) return;
    if (!session.address) {
      setFormMessage('Connect a wallet first.');
      return;
    }
    if (!config.governorContractId) {
      setFormMessage('Missing governor contract id.');
      return;
    }

    setBusy(true);
    setFormMessage('');
    tx.start('Submitting vote...');

    try {
      const governor = await getGovernor();
      const assembled = await governor.cast_vote({
        proposal_id: proposalIdToBuffer(detail.proposalId),
        vote_type: voteType,
        reason: voteReason,
        voter: session.address
      });
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Vote submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      setVoteReason('');
      setSelectedVoteType(null);
      void mutate();
      tx.success('Vote cast', hash);
    } catch (err) {
      tx.fail(err, 'Vote failed');
    } finally {
      setBusy(false);
    }
  }

  async function queueProposal() {
    if (!detail) return;
    if (!session.address) {
      setFormMessage('Connect a wallet first.');
      return;
    }
    if (!config.governorContractId) {
      setFormMessage('Missing governor contract id.');
      return;
    }
    if (!config.treasuryContractId) {
      setFormMessage('Missing treasury contract id.');
      return;
    }

    setBusy(true);
    setFormMessage('');
    tx.start('Queueing proposal...');

    try {
      const governor = await getGovernor();
      const args = encodeProposalCallArgs(detail.functions, detail.args);
      const payload = {
        targets: detail.targets,
        functions: detail.functions,
        args,
        description_hash: descriptionHash(detail.description),
        // The governor derives ETA from queue delay; this binding argument is ignored.
        eta: 0,
        operator: session.address
      };

      const assembled = await governor.queue(payload);
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Proposal queued', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      void mutate();
      tx.success('Proposal queued', hash);
    } catch (err) {
      tx.fail(err, 'Queue failed');
    } finally {
      setBusy(false);
    }
  }

  async function executeProposal() {
    if (!detail) return;
    if (!session.address) {
      setFormMessage('Connect a wallet first.');
      return;
    }
    if (!config.governorContractId) {
      setFormMessage('Missing governor contract id.');
      return;
    }
    if (!config.treasuryContractId || !config.tokenContractId) {
      setFormMessage('Missing DAO contract ids in the active network config.');
      return;
    }
    if (detail.eta && Date.now() < detail.eta * 1000) {
      setFormMessage('Queued proposal is not ready to execute yet.');
      return;
    }

    setBusy(true);
    setFormMessage('');
    tx.start('Executing proposal...');

    try {
      const governor = await getGovernor();

      const args = encodeProposalCallArgs(detail.functions, detail.args);

      const executeParams = {
        targets: detail.targets,
        functions: detail.functions,
        args,
        description_hash: descriptionHash(detail.description),
        executor: session.address
      };

      const assembled = await governor.execute(executeParams);

      const sent = await assembled.signAndSend();

      const hash = sent.sendTransactionResponse?.hash ?? '';

      if (!hash) {
        throw new Error('No transaction hash received from response');
      }

      tx.submitted('Proposal executing', hash);

      await waitForConfirmation(hash, config.rpcUrl);

      void mutate();
      tx.success('Proposal executed', hash);
    } catch (err) {
      tx.fail(err, 'Execute failed');
    } finally {
      setBusy(false);
    }
  }

  const currentVote = session.address ? (votes.find((vote) => vote.voter === session.address) ?? null) : null;
  const actionMode = proposalActionMode(detail?.state);
  const errorMessage = error instanceof Error ? error.message : '';
  const voteUnavailableReason =
    actionMode !== 'vote'
      ? ''
      : !session.address
        ? 'Connect a wallet to vote.'
        : votingPowerLoading
          ? 'Voting power is still loading.'
          : votingPowerError
            ? `Voting power could not be loaded: ${votingPowerError.message}`
            : votingPower && votingPower.votes > 0n
              ? ''
              : 'No voting power at the proposal snapshot.';
  const canVote = Boolean(actionMode === 'vote' && !currentVote && !voteUnavailableReason);

  function voteLabelForSupport(support: number) {
    if (support === VOTE_FOR) return 'For';
    if (support === VOTE_AGAINST) return 'Against';
    return 'Abstain';
  }

  const actionPanel =
    detail && actionMode === 'vote' ? (
      <ProposalVotePanel
        canVote={canVote}
        busy={busy}
        voteReason={voteReason}
        selectedVoteType={selectedVoteType}
        votingPower={votingPower?.votes.toString() ?? null}
        votingPowerLoading={votingPowerLoading}
        votingPowerError={votingPowerError?.message ?? ''}
        unavailableReason={voteUnavailableReason}
        onVoteReasonChange={setVoteReason}
        onSelectedVoteTypeChange={setSelectedVoteType}
        onVote={(voteType) => void submitVote(voteType)}
        currentVote={
          currentVote ? { label: voteLabelForSupport(currentVote.support), reason: currentVote.reason } : null
        }
      />
    ) : detail && actionMode === 'queue' ? (
      <ProposalQueuePanel busy={busy} onQueue={() => void queueProposal()} />
    ) : detail && actionMode === 'execute' ? (
      <ProposalExecutePanel busy={busy} now={now} eta={detail.eta} onExecute={() => void executeProposal()} />
    ) : null;

  return (
    <DaoShell>
      <PageSection
        title={
          detail
            ? `Proposal #${detail.proposalNumber}: ${detail.metadata.title}`
            : `Proposal ${shortenProposalId(proposalId)}`
        }
        description="Live vote state, indexed votes, and proposal actions for the selected governance item."
      >
        <Stack gap="4">
          {errorMessage ? <Callout variant="error" title={errorMessage} /> : null}
          {isLoading && !detail ? <Callout variant="info" title="Loading proposal…" /> : null}

          {detail ? (
            <div className="proposal-detail-layout">
              <div className="proposal-detail-main">
                <ProposalOverview detail={detail} network={config.name} />
                <ProposalActionPreview
                  targets={detail.targets}
                  functions={detail.functions}
                  args={detail.args}
                  tokenContractId={config.tokenContractId}
                />
                <ProposalVoteHistory
                  votes={votes}
                  voteLabelForSupport={voteLabelForSupport}
                  formatTimestamp={formatTimestamp}
                />
              </div>
              <aside className="proposal-detail-sidebar" aria-label="Proposal status and voting">
                {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
                <ProposalLifecyclePanel detail={detail} now={now} actionSlot={actionPanel} />
                <ProposalVoteSummary votes={votes} quorumVotes={detail.quorumVotes} />
                <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                  {isLoading ? 'Refreshing...' : 'Refresh proposal'}
                </Button>
              </aside>
            </div>
          ) : null}

          <Link href="/proposals" style={{ color: 'inherit' }}>
            Back to proposals
          </Link>
        </Stack>
      </PageSection>
    </DaoShell>
  );
}
