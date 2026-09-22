import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { NextResponse } from 'next/server';

import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { getGoldskyProposalList } from '@/lib/goldsky';
import { proposalIdToBuffer } from '@/lib/proposal-id';
import { parseProposalMetadata, type ProposalMetadata } from '@/lib/proposal-metadata';
import {
  type ProposalState as ProposalStateValue,
  proposalStateFromLabel,
  proposalStateLabel
} from '@/lib/proposal-state';

type ProposalListItem = {
  proposalId: string;
  proposalNumber: number;
  metadata: ProposalMetadata;
  state: ProposalStateValue | null;
  stateLabel: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
  voteTotals: {
    forVotes: string;
    againstVotes: string;
    abstainVotes: string;
  } | null;
};

async function fetchProposalState(client: InstanceType<typeof GovernorClient>, proposalId: string) {
  const proposalBuffer = proposalIdToBuffer(proposalId);
  const stateTx = await client.proposal_state({ proposal_id: proposalBuffer });
  return stateTx.result;
}

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const url = new URL(request.url);
  const { daoId } = await params;
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? '24'), 100));
  const status = url.searchParams.get('status') ?? undefined;
  const config = await getDaoNetworkConfigById(daoId);

  if (!config.governorContractId) {
    return NextResponse.json(
      { items: [], generatedAt: new Date().toISOString(), message: 'Missing governor contract id' },
      { status: 400 }
    );
  }

  try {
    const proposalData = await getGoldskyProposalList(daoId, { limit, status });

    const client = new GovernorClient({
      contractId: config.governorContractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: config.adminAddress
    });

    const items = await Promise.all(
      proposalData.items.map(async (proposal: any): Promise<ProposalListItem> => {
        const metadata = parseProposalMetadata(proposal.description ?? '');
        let state: ProposalStateValue | null = null;
        try {
          state = await fetchProposalState(client, proposal.proposal_id);
        } catch {
          state = proposalStateFromLabel(proposal.state);
        }
        return {
          proposalId: proposal.proposal_id,
          proposalNumber: Number(proposal.proposal_number),
          metadata,
          state,
          stateLabel: state === null ? (proposal.state ?? 'Unknown') : proposalStateLabel(state),
          ledger: Number(proposal.created_ledger ?? 0),
          timestamp: Number(proposal.created_timestamp ?? 0),
          txHash: '',
          contractId: config.governorContractId,
          voteTotals: {
            forVotes: String(proposal.for_votes ?? 0),
            againstVotes: String(proposal.against_votes ?? 0),
            abstainVotes: String(proposal.abstain_votes ?? 0)
          }
        };
      })
    );

    return NextResponse.json(
      { items, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Proposal list unavailable'
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
