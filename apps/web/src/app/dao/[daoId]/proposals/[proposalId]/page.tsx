'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Buffer } from 'buffer';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { ProposalActionPreview } from '@/components/proposal/proposal-action-preview';
import { ProposalExecutePanel } from '@/components/proposal/proposal-execute-panel';
import { ProposalExecutionReceipt } from '@/components/proposal/proposal-execution-receipt';
import { ProposalLifecyclePanel, ProposalOverview } from '@/components/proposal/proposal-overview';
import { ProposalQueuePanel } from '@/components/proposal/proposal-queue-panel';
import { ProposalStateBadge } from '@/components/proposal/proposal-state-badge';
import { ProposalVoteHistory } from '@/components/proposal/proposal-vote-history';
import { ProposalVotePanel } from '@/components/proposal/proposal-vote-panel';
import { ProposalVoteSummary } from '@/components/proposal/proposal-vote-summary';
import type { ProposalDetail, ProposalVoteItem } from '@/components/proposal/types';
import { Avatar, Button, ButtonLink, Callout, ConfirmAction, Skeleton } from '@/components/ui';
import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useDaoContext } from '@/contexts/dao-context';
import { shortAddress } from '@/lib/activity-feed';
import { daoRoute } from '@/lib/dao-routes';
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

const page = css({ display: 'grid', gap: '5' });
const back = css({ justifySelf: 'start', ml: '-3' });
const loading = css({ display: 'grid', gap: '4' });
const header = css({ display: 'grid', gap: '3' });
const title = css({ textStyle: 'title', fontSize: { base: '1.625rem', md: '2.125rem' }, m: '0', textWrap: 'balance' });
const byline = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  textStyle: 'caption',
  color: 'ink.muted',
  m: '0'
});
const layout = css({
  display: 'grid',
  gap: '8',
  mt: '2',
  lg: { gridTemplateColumns: 'minmax(0, 1fr) 360px', gridTemplateAreas: '"main side"', alignItems: 'start' }
});
const side = css({
  display: 'grid',
  gap: '4',
  minW: '0',
  lg: { gridArea: 'side', position: 'sticky', top: '20' }
});
const main = css({ display: 'grid', gap: '8', minW: '0', lg: { gridArea: 'main' } });
const summaryCard = css({ p: '5', borderRadius: 'card', bg: 'surface', boxShadow: 'raised' });

export default function ProposalDetailPage() {
  const { daoId, daoConfig: config, routeId } = useDaoContext();
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const session = useAuthSessionStore();
  const [voteReason, setVoteReason] = useState('');
  const [selectedVoteType, setSelectedVoteType] = useState<number | null>(null);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
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
      setJustVoted(true);
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

  const voters = votes.map((vote) => vote.voter);

  return (
    <div className={page}>
      <ButtonLink href={daoRoute(routeId, 'proposals')} variant="ghost" size="sm" className={back}>
        <ChevronLeft aria-hidden="true" />
        All votes
      </ButtonLink>

      {errorMessage ? <Callout variant="error" title="This proposal didn't load" description={errorMessage} /> : null}

      {isLoading && !detail ? (
        <div className={loading} role="status" aria-busy="true">
          <span className="sr-only">Loading proposal</span>
          <Skeleton className={css({ width: '28', height: '6' })} />
          <Skeleton className={css({ width: '80%', height: '9' })} />
          <Skeleton className={css({ height: '40', borderRadius: 'card' })} />
          <Skeleton className={css({ height: '24' })} />
        </div>
      ) : null}

      {detail ? (
        <>
          <header className={header}>
            <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '2', alignItems: 'center' })}>
              <ProposalStateBadge label={detail.label} />
              <span className={css({ textStyle: 'mono', color: 'ink.muted' })}>Proposal {detail.proposalNumber}</span>
            </div>
            <h1 className={title}>{detail.metadata.title || `Proposal ${shortenProposalId(proposalId)}`}</h1>
            <p className={byline}>
              <Avatar address={detail.proposer} size="xs" />
              {detail.proposer === session.address
                ? 'You proposed this'
                : `Proposed by ${shortAddress(detail.proposer)}`}
            </p>
          </header>

          <div className={layout}>
            <aside className={side} aria-label="Status and voting">
              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
              <ProposalLifecyclePanel detail={detail} now={now} actionSlot={actionPanel} />
              <section className={summaryCard} aria-label="Results so far">
                <ProposalVoteSummary
                  totals={{ for: detail.for_votes, against: detail.against_votes, abstain: detail.abstain_votes }}
                  quorumVotes={detail.quorumVotes}
                  voters={voters}
                  viewer={session.address}
                  celebrateViewer={justVoted}
                />
              </section>
              {detail.proposer === session.address &&
              (detail.state === ProposalState.Pending || detail.state === ProposalState.Active) ? (
                <ConfirmAction
                  trigger={
                    <Button variant="danger" block disabled={busy || actionsDisabled || !availability.cancel}>
                      Cancel proposal
                    </Button>
                  }
                  title="Cancel this proposal?"
                  description="Voting stops and it can't be reopened. You'd need to propose it again."
                  confirmLabel="Cancel proposal"
                  busy={busy}
                  onConfirm={() => cancelProposal()}
                />
              ) : null}
            </aside>

            <div className={main}>
              {encodingError ? <Callout variant="warning" title={encodingError} /> : null}
              {receipt ? <ProposalExecutionReceipt receipt={receipt} /> : null}
              {receiptError ? <Callout variant="warning" title={`Executed. ${receiptError}`} /> : null}
              {!receipt && detail.executionReceiptStatus === 'pending' ? (
                <Callout title="Executed. The receipt will show here once it's indexed." />
              ) : null}
              {!receipt && detail.executionReceiptStatus === 'unavailable' ? (
                <Callout variant="warning" title="Executed. The receipt isn't available from the indexer." />
              ) : null}
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
                viewer={session.address}
              />
              {data?.votesError ? <Callout variant="warning" title="Vote history didn't load" /> : null}
              <div>
                <Button variant="ghost" size="sm" onClick={() => void mutate()} loading={isLoading}>
                  {isLoading ? null : <RefreshCw aria-hidden="true" />}
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
