'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Buffer } from 'buffer';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Stack } from 'styled-system/jsx';
import useSWR from 'swr';

import { PageSection } from '@/components/page-section';
import { ProposalActionPreview } from '@/components/proposal/proposal-action-preview';
import { ProposalExecutePanel } from '@/components/proposal/proposal-execute-panel';
import { ProposalExecutionReceipt } from '@/components/proposal/proposal-execution-receipt';
import { ProposalLifecyclePanel, ProposalOverview } from '@/components/proposal/proposal-overview';
import { ProposalQueuePanel } from '@/components/proposal/proposal-queue-panel';
import { ProposalVoteHistory } from '@/components/proposal/proposal-vote-history';
import { ProposalVotePanel } from '@/components/proposal/proposal-vote-panel';
import { ProposalVoteSummary } from '@/components/proposal/proposal-vote-summary';
import type { ProposalDetail, ProposalVoteItem } from '@/components/proposal/types';
import { Button, Callout, Card, Skeleton } from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { keccak256Bytes } from '@/lib/keccak';
import { proposalActionAvailability } from '@/lib/proposal-availability';
import { encodeProposalCallArgs, proposalCallId } from '@/lib/proposal-call';
import {
  decodeExecutionReceipt,
  type ProposalExecutionReceipt as ExecutionReceipt
} from '@/lib/proposal-execution-receipt';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { proposalActionMode, ProposalState } from '@/lib/proposal-state';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { useVotingPower } from '@/lib/voting-power';
import { signWithWallet } from '@/lib/wallet-sign';
import { useAuthSessionStore } from '@/stores/auth-session-store';

type ProposalPageData = {
  detail: ProposalDetail;
  votes: ProposalVoteItem[];
  votesError: string;
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

async function fetchProposalPageData([, , daoId, proposalId]: readonly [
  'proposal-detail',
  string,
  string,
  string
]): Promise<ProposalPageData> {
  const [detailResponse, votesResponse] = await Promise.all([
    fetch(`/api/dao/${encodeURIComponent(daoId)}/proposals/${proposalId}`, { cache: 'no-store' }),
    fetch(`/api/dao/${encodeURIComponent(daoId)}/proposals/${proposalId}/votes`, { cache: 'no-store' }).catch(
      () => null
    )
  ]);

  if (!detailResponse.ok) {
    throw new Error((await detailResponse.json()).message || 'Proposal lookup failed');
  }

  const detail = (await detailResponse.json()) as ProposalDetail;
  const votesPayload = votesResponse
    ? ((await votesResponse.json().catch(() => null)) as { items?: ProposalVoteItem[] } | null)
    : null;

  return {
    detail,
    votes: votesResponse?.ok ? (votesPayload?.items ?? []) : [],
    votesError: votesResponse?.ok && votesPayload ? '' : 'Indexed vote history is unavailable.'
  };
}

export default function ProposalDetailPage() {
  const { daoId, daoConfig: config } = useDaoContext();
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const session = useAuthSessionStore();
  const [voteReason, setVoteReason] = useState('');
  const [selectedVoteType, setSelectedVoteType] = useState<number | null>(null);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = useTransactionFeedback(config.name);
  const [now, setNow] = useState(() => Date.now());
  const [executionResult, setExecutionResult] = useState<{
    key: string;
    receipt: ExecutionReceipt | null;
    error: string;
  } | null>(null);
  const receiptKey = [
    DEPLOYMENT_ID,
    daoId,
    proposalId,
    config.treasuryContractId,
    config.rpcUrl,
    config.passphrase
  ].join(':');

  const { data, error, isLoading, mutate } = useSWR(
    proposalId ? (['proposal-detail', DEPLOYMENT_ID, daoId, proposalId] as const) : null,
    fetchProposalPageData,
    { shouldRetryOnError: false, revalidateOnFocus: true, refreshInterval: 5000 }
  );

  const detail = data?.detail ?? null;
  const receipt =
    (executionResult?.key === receiptKey ? executionResult.receipt : null) ?? detail?.executionReceipt ?? null;
  const receiptError = executionResult?.key === receiptKey ? executionResult.error : '';
  const votes = data?.votes ?? [];
  const {
    data: hasVoted,
    error: hasVotedError,
    mutate: refreshHasVoted
  } = useSWR(
    detail && session.address
      ? ([
          'proposal-has-voted',
          daoId,
          config.governorContractId,
          config.rpcUrl,
          config.passphrase,
          detail.proposalId,
          session.address
        ] as const)
      : null,
    async ([, , governorId, rpcUrl, passphrase, id, address]) => {
      const governor = new GovernorClient({
        contractId: governorId,
        rpcUrl,
        networkPassphrase: passphrase,
        publicKey: address
      });
      return (await governor.has_voted({ proposal_id: proposalIdToBuffer(id), account: address })).result;
    },
    { refreshInterval: 5000, revalidateOnFocus: true }
  );
  const encodingError = useMemo(() => {
    if (!detail) return '';
    try {
      const encoded = encodeProposalCallArgs(detail.targets, detail.functions, detail.args, config);
      const hash = proposalCallId(detail.targets, detail.functions, encoded, descriptionHash(detail.description));
      if (hash !== proposalIdToBuffer(detail.proposalId).toString('hex'))
        throw new Error('Indexed arguments do not reproduce this proposal ID. Submission is disabled.');
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'Unsupported proposal calls.';
    }
  }, [detail, config]);
  const actionsDisabled = !session.address || detail?.stateSource !== 'chain' || !!encodingError;
  const availability = detail
    ? proposalActionAvailability(detail, now, session.address)
    : { vote: false, cancel: false, queue: false, execute: false };
  const {
    data: votingPower,
    error: votingPowerError,
    isLoading: votingPowerLoading
  } = useVotingPower(config, detail ? session.address : '', detail?.vote_snapshot);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const boundaries = [detail.vote_start, detail.vote_end, detail.eta, detail.expiresAt ?? 0]
      .map((seconds) => seconds * 1000)
      .filter((time) => time > Date.now());
    if (!boundaries.length) return;
    // A timer refreshes the real chain state; the wall-clock countdown is not a
    // substitute for Governor.proposal_state. Polling handles ledger-close lag.
    const timer = setTimeout(() => void mutate(), Math.min(2_147_483_647, Math.min(...boundaries) - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [detail, mutate]);

  async function requireCurrentState(expected: number[]) {
    if (!detail) throw new Error('Proposal unavailable.');
    const governor = await getGovernor();
    const state = (await governor.proposal_state({ proposal_id: proposalIdToBuffer(detail.proposalId) })).result;
    if (!expected.includes(state)) {
      void mutate();
      throw new Error('Proposal state changed. Refresh before continuing.');
    }
    return governor;
  }

  async function verifiedCallPayload(governor: GovernorClient) {
    if (!detail) throw new Error('Proposal unavailable.');
    const payload = {
      targets: detail.targets,
      functions: detail.functions,
      args: encodeProposalCallArgs(detail.targets, detail.functions, detail.args, config),
      description_hash: descriptionHash(detail.description)
    };
    const computed = (await governor.get_proposal_id(payload)).result;
    if (!proposalIdToBuffer(detail.proposalId).equals(Buffer.from(computed)))
      throw new Error('Indexed arguments do not reproduce this proposal ID. Submission is disabled.');
    return payload;
  }

  async function getGovernor() {
    if (!session.address) throw new Error('Connect a wallet first.');
    if (!config.governorContractId) throw new Error('Missing governor contract id.');

    return new GovernorClient({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: session.address,
      signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
        signWithWallet(xdr, {
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
      const governor = await requireCurrentState([ProposalState.Active]);
      if (
        (await governor.has_voted({ proposal_id: proposalIdToBuffer(detail.proposalId), account: session.address }))
          .result
      )
        throw new Error('This wallet has already voted.');
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
      await Promise.all([mutate(), refreshHasVoted()]);
      tx.success('Vote cast', hash);
    } catch (err) {
      tx.fail(err, 'Vote failed', 'governor');
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
      const governor = await requireCurrentState([ProposalState.Succeeded]);
      const payload = {
        ...(await verifiedCallPayload(governor)),
        // The governor derives ETA from queue delay; this binding argument is ignored.
        eta: 0,
        operator: session.address
      };

      const assembled = await governor.queue(payload);
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Proposal queued', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      await mutate();
      tx.success('Proposal queued', hash);
    } catch (err) {
      tx.fail(err, 'Queue failed', 'governor');
    } finally {
      setBusy(false);
    }
  }

  // Execution goes through Treasury.execute (callable by anyone). Governor.execute always fails with
  // UseTreasuryExecute (1508). If any call fails the whole transaction reverts and the proposal stays
  // Queued, so the same action can be retried until the proposal expires.
  async function executeProposal() {
    if (!detail) return;
    if (!session.address) {
      setFormMessage('Connect a wallet first.');
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
      const governor = await requireCurrentState([ProposalState.Queued]);
      const payload = await verifiedCallPayload(governor);
      const treasury = new TreasuryClient({
        contractId: config.treasuryContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          signWithWallet(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          })
      });

      const assembled = await treasury.execute(payload);

      const sent = await assembled.signAndSend();

      const hash = sent.sendTransactionResponse?.hash ?? '';

      if (!hash) {
        throw new Error('No transaction hash received from response');
      }

      tx.submitted('Proposal executing', hash);

      const confirmed = await waitForConfirmation(hash, config.rpcUrl);
      try {
        setExecutionResult({ key: receiptKey, receipt: decodeExecutionReceipt(confirmed, config, detail), error: '' });
      } catch (error) {
        setExecutionResult({
          key: receiptKey,
          receipt: null,
          error: error instanceof Error ? error.message : 'Receipt unavailable.'
        });
      }
      await mutate();
      tx.success('Proposal executed', hash);
    } catch (err) {
      tx.fail(err, 'Execute failed', 'treasury');
    } finally {
      setBusy(false);
    }
  }

  async function cancelProposal() {
    if (!detail || detail.proposer !== session.address) return;
    setBusy(true);
    tx.start('Canceling proposal...');
    try {
      const governor = await requireCurrentState([ProposalState.Pending, ProposalState.Active]);
      const payload = await verifiedCallPayload(governor);
      const sent = await (await governor.cancel({ ...payload, operator: session.address })).signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Cancellation submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      await mutate();
      tx.success('Proposal canceled', hash);
    } catch (error) {
      tx.fail(error, 'Cancel failed', 'governor');
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
  const canVote = Boolean(availability.vote && hasVoted === false && !voteUnavailableReason);

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
        unavailableReason={
          hasVotedError
            ? 'Unable to check whether this wallet has voted.'
            : hasVoted === undefined && session.address
              ? 'Checking prior vote...'
              : hasVoted
                ? 'This wallet has already voted.'
                : voteUnavailableReason
        }
        onVoteReasonChange={setVoteReason}
        onSelectedVoteTypeChange={setSelectedVoteType}
        onVote={(voteType) => void submitVote(voteType)}
        currentVote={
          currentVote ? { label: voteLabelForSupport(currentVote.support), reason: currentVote.reason } : null
        }
      />
    ) : detail && actionMode === 'queue' ? (
      <ProposalQueuePanel
        busy={busy}
        disabled={actionsDisabled || !availability.queue}
        onQueue={() => void queueProposal()}
      />
    ) : detail && actionMode === 'execute' ? (
      <ProposalExecutePanel
        busy={busy}
        disabled={actionsDisabled || !availability.execute}
        now={now}
        eta={detail.eta}
        expiresAt={detail.expiresAt}
        onExecute={() => void executeProposal()}
      />
    ) : null;

  return (
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
        {isLoading && !detail ? (
          <div className="proposal-detail-layout" role="status" aria-busy="true">
            <span className="sr-only">Loading proposal</span>
            <div className="proposal-detail-main">
              <Card p="5">
                <Stack gap="3">
                  <Skeleton style={{ width: '42%', height: '1.5em' }} />
                  <Skeleton style={{ width: '72%', height: '0.9em' }} />
                  <Skeleton style={{ width: '100%', height: '96px' }} />
                </Stack>
              </Card>
              <Card p="5">
                <Stack gap="3">
                  <Skeleton style={{ width: '130px', height: '1.1em' }} />
                  <Skeleton style={{ width: '100%', height: '1em' }} />
                  <Skeleton style={{ width: '84%', height: '1em' }} />
                  <Skeleton style={{ width: '68%', height: '1em' }} />
                </Stack>
              </Card>
              <Card p="5">
                <Stack gap="3">
                  <Skeleton style={{ width: '120px', height: '1.1em' }} />
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} style={{ width: '100%', height: '2.2em' }} />
                  ))}
                </Stack>
              </Card>
            </div>
            <aside className="proposal-detail-sidebar">
              <Card p="5">
                <Stack gap="3">
                  <Skeleton style={{ width: '60%', height: '1.1em' }} />
                  <Skeleton style={{ width: '100%', height: '4em' }} />
                  <Skeleton style={{ width: '100%', height: '8em' }} />
                  <Skeleton style={{ width: '110px', height: '2.4em' }} />
                </Stack>
              </Card>
            </aside>
          </div>
        ) : null}

        {detail ? (
          <div className="proposal-detail-layout">
            <div className="proposal-detail-main">
              <ProposalOverview detail={detail} network={config.name} />
              {encodingError ? <Callout variant="warning" title={encodingError} /> : null}
              {receipt ? <ProposalExecutionReceipt receipt={receipt} /> : null}
              {receiptError ? <Callout variant="warning" title={`Execution confirmed; ${receiptError}`} /> : null}
              {!receipt && detail.executionReceiptStatus === 'pending' ? (
                <Callout title="Execution receipt not indexed yet. The ordered receipt will appear after indexing catches up." />
              ) : null}
              {!receipt && detail.executionReceiptStatus === 'unavailable' ? (
                <Callout variant="warning" title="Proposal executed; the indexed execution receipt is unavailable." />
              ) : null}
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
              {data?.votesError ? <Callout variant="warning" title={data.votesError} /> : null}
            </div>
            <aside className="proposal-detail-sidebar" aria-label="Proposal status and voting">
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
              <ProposalLifecyclePanel detail={detail} now={now} actionSlot={actionPanel} />
              {detail.proposer === session.address &&
              (detail.state === ProposalState.Pending || detail.state === ProposalState.Active) ? (
                <Button
                  disabled={busy || actionsDisabled || !availability.cancel}
                  onClick={() => void cancelProposal()}
                >
                  Cancel proposal
                </Button>
              ) : null}
              <ProposalVoteSummary
                totals={{ for: detail.for_votes, against: detail.against_votes, abstain: detail.abstain_votes }}
                quorumVotes={detail.quorumVotes}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh proposal'}
              </Button>
            </aside>
          </div>
        ) : null}

        <Link href={`/dao/${daoId}/proposals`} style={{ color: 'inherit' }}>
          Back to proposals
        </Link>
      </Stack>
    </PageSection>
  );
}
