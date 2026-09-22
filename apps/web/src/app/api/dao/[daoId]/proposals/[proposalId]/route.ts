import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { NextResponse } from 'next/server';

import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { getGoldskyProposalDetail } from '@/lib/goldsky';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { parseProposalMetadata } from '@/lib/proposal-metadata';
import { ProposalState, proposalStateFromLabel, proposalStateLabel } from '@/lib/proposal-state';

export async function GET(_request: Request, context: { params: Promise<{ daoId: string; proposalId: string }> }) {
  const { daoId, proposalId } = await context.params;
  const config = await getDaoNetworkConfigById(daoId);

  if (!config.governorContractId) {
    return NextResponse.json({ message: 'Missing governor contract id' }, { status: 400 });
  }

  try {
    const { proposal } = await getGoldskyProposalDetail(daoId, proposalId);

    try {
      const client = new GovernorClient({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: config.adminAddress
      });

      const proposalBuffer = proposalIdToBuffer(proposal.proposal_id);
      const [stateTx, deadlineTx, snapshotTx, proposerTx, votingPeriodTx] = await Promise.all([
        client.proposal_state({ proposal_id: proposalBuffer }),
        client.proposal_deadline({ proposal_id: proposalBuffer }),
        client.proposal_snapshot({ proposal_id: proposalBuffer }),
        client.proposal_proposer({ proposal_id: proposalBuffer }),
        client.voting_period()
      ]);
      let quorumVotes: string | null = null;
      try {
        const quorumTx = await client.quorum({ ledger: snapshotTx.result });
        quorumVotes = quorumTx.result.toString();
      } catch {
        quorumVotes = null;
      }

      const deadline = Number(proposal.deadline_ledger ?? deadlineTx.result);
      const voteStart =
        proposal.vote_start_timestamp == null || Number(proposal.vote_start_timestamp) === 0
          ? deadline - Number(votingPeriodTx.result)
          : Number(proposal.vote_start_timestamp);
      const metadata = parseProposalMetadata(proposal.description ?? '');
      const payload = {
        proposalId: proposal.proposal_id,
        proposalNumber: proposal.proposal_number,
        description: proposal.description,
        title: metadata.title,
        metadata,
        proposer: proposal.proposer || proposerTx.result,
        vote_end: deadline,
        vote_snapshot: Number(proposal.snapshot_ledger ?? snapshotTx.result),
        vote_start: voteStart,
        deadline,
        eta: proposal.eta == null ? 0 : Number(proposal.eta),
        state: stateTx.result,
        label: proposalStateLabel(stateTx.result),
        quorumVotes,
        ledger: Number(proposal.created_ledger ?? 0),
        timestamp: Number(proposal.created_timestamp ?? 0),
        for_votes: String(proposal.vote_summary?.for ?? 0),
        against_votes: String(proposal.vote_summary?.against ?? 0),
        abstain_votes: String(proposal.vote_summary?.abstain ?? 0),
        targets: proposal.actions?.map((action: any) => action.target) ?? [],
        functions: proposal.actions?.map((action: any) => action.function) ?? [],
        args: proposal.actions?.map((action: any) => action.args) ?? []
      };

      return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json(
        {
          proposalId: proposal.proposal_id,
          proposalNumber: proposal.proposal_number,
          description: proposal.description,
          title: parseProposalMetadata(proposal.description ?? '').title,
          metadata: parseProposalMetadata(proposal.description ?? ''),
          proposer: proposal.proposer,
          vote_end: proposal.deadline_ledger == null ? 0 : Number(proposal.deadline_ledger),
          vote_snapshot: proposal.snapshot_ledger == null ? 0 : Number(proposal.snapshot_ledger),
          vote_start: proposal.vote_start_timestamp == null ? 0 : Number(proposal.vote_start_timestamp),
          deadline: proposal.deadline_ledger == null ? 0 : Number(proposal.deadline_ledger),
          eta: proposal.eta == null ? 0 : Number(proposal.eta),
          state: proposalStateFromLabel(proposal.state) ?? ProposalState.Pending,
          label: proposal.state || 'Pending',
          quorumVotes: null,
          ledger: Number(proposal.created_ledger ?? 0),
          timestamp: Number(proposal.created_timestamp ?? 0),
          for_votes: String(proposal.vote_summary?.for ?? 0),
          against_votes: String(proposal.vote_summary?.against ?? 0),
          abstain_votes: String(proposal.vote_summary?.abstain ?? 0),
          targets: proposal.actions?.map((action: any) => action.target) ?? [],
          functions: proposal.actions?.map((action: any) => action.function) ?? [],
          args: proposal.actions?.map((action: any) => action.args) ?? []
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Proposal unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
