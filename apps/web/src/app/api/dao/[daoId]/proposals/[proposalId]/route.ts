import { NextResponse } from 'next/server';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { getGoldskyProposalDetail } from '@/lib/goldsky';
import { PROPOSAL_EXPIRATION_SECONDS, readProposalChainState } from '@/lib/proposal-chain-state';
import { getIndexedExecutionReceipt } from '@/lib/proposal-execution-receipt-service';
import { parseProposalMetadata } from '@/lib/proposal-metadata';
import { ProposalState, proposalStateFromLabel, proposalStateLabel } from '@/lib/proposal-state';

export async function GET(_request: Request, context: { params: Promise<{ daoId: string; proposalId: string }> }) {
  try {
    const { daoId, proposalId } = await context.params;
    const config = await getDaoNetworkConfigById(daoId);
    if (!config.governorContractId)
      return NextResponse.json({ message: 'Missing governor contract id' }, { status: 400 });
    // Existing service establishes deployment_id + DAO identity. Never broaden on failure.
    const { proposal } = await getGoldskyProposalDetail(daoId, proposalId);
    const live = await readProposalChainState(config, proposal.proposal_id).catch(() => null);
    const state = live?.state ?? proposalStateFromLabel(proposal.state);
    const deadline = live?.core?.voteEnd ?? live?.deadline ?? Number(proposal.vote_end_timestamp ?? 0);
    const eta = live?.core?.eta ?? Number(proposal.eta ?? 0);
    const voteStart = live?.core?.voteStart ?? Number(proposal.vote_start_timestamp ?? 0);
    const metadata = parseProposalMetadata(proposal.description ?? '');
    const targets = proposal.actions.map((action: any) => action.target);
    const functions = proposal.actions.map((action: any) => action.function);
    let executionReceipt = null;
    let executionReceiptStatus = 'not-applicable';
    if (state === ProposalState.Executed) {
      try {
        executionReceipt = await getIndexedExecutionReceipt(
          {
            deploymentId: DEPLOYMENT_ID,
            daoId: config.tokenContractId,
            treasuryContractId: config.treasuryContractId,
            governorContractId: config.governorContractId
          },
          { proposalId: proposal.proposal_id, targets, functions }
        );
        executionReceiptStatus = executionReceipt ? 'available' : 'pending';
      } catch {
        executionReceiptStatus = 'unavailable';
      }
    }
    return NextResponse.json(
      {
        proposalId: proposal.proposal_id,
        proposalNumber: proposal.proposal_number,
        description: proposal.description,
        title: metadata.title,
        metadata,
        // The indexed proposer (proposal_created); no extra RPC read needed.
        proposer: proposal.proposer,
        vote_end: deadline,
        vote_snapshot: live?.core?.snapshot ?? live?.snapshot ?? Number(proposal.snapshot_ledger ?? 0),
        vote_start: voteStart,
        voteStartSource: live?.core ? 'chain' : voteStart ? 'indexed' : 'unavailable',
        deadline,
        eta,
        etaSource: live?.core ? 'chain' : eta ? 'indexed' : 'unavailable',
        expiresAt:
          state === ProposalState.Queued && eta
            ? eta + PROPOSAL_EXPIRATION_SECONDS
            : state === ProposalState.Succeeded && deadline
              ? deadline + PROPOSAL_EXPIRATION_SECONDS
              : null,
        state,
        stateSource: live?.stateSource ?? 'indexed',
        label: proposalStateLabel(state),
        quorumVotes: live?.quorumVotes ?? proposal.quorum_votes ?? null,
        quorumSource:
          live?.quorumVotes !== undefined && live?.quorumVotes !== null
            ? 'chain'
            : proposal.quorum_votes
              ? 'indexed'
              : 'unavailable',
        ledger: Number(proposal.created_ledger ?? 0),
        timestamp: Number(proposal.created_timestamp ?? 0),
        for_votes: String(proposal.vote_summary?.for ?? 0),
        against_votes: String(proposal.vote_summary?.against ?? 0),
        abstain_votes: String(proposal.vote_summary?.abstain ?? 0),
        executionReceipt,
        executionReceiptStatus,
        targets,
        functions,
        args: proposal.actions.map((action: any) => action.args)
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Proposal unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
