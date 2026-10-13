import { NextResponse } from 'next/server';

import { parseLimit, parseNonNegativeInteger } from '@/lib/api-pagination';
import { chainProposalPage } from '@/lib/chain-reads/proposals';
import { rpcProposalReader } from '@/lib/chain-reads/proposals-rpc';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { getGoldskyProposalList } from '@/lib/goldsky';
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

export async function GET(request: Request, { params }: { params: Promise<{ daoId: string }> }) {
  const url = new URL(request.url);
  const { daoId } = await params;
  const limit = Math.max(1, parseLimit(url.searchParams.get('limit'), 24));
  const offset = parseNonNegativeInteger(url.searchParams.get('offset'), 0);
  const status = url.searchParams.get('status') ?? undefined;
  const config = await getDaoNetworkConfigById(daoId);

  if (!config.governorContractId) {
    return NextResponse.json(
      { items: [], generatedAt: new Date().toISOString(), message: 'Missing governor contract id' },
      { status: 400 }
    );
  }

  try {
    const proposalData = await getGoldskyProposalList(daoId, { limit, offset, status });

    // The indexed state mirrors Governor.proposal_state (computed from
    // ProposalScheduled windows, quorum and lifecycle events), so the list needs
    // no per-proposal RPC read. Detail pages still recheck live state.
    const items = proposalData.items.map((proposal: any): ProposalListItem => {
      const metadata = parseProposalMetadata(proposal.description ?? '');
      const state: ProposalStateValue | null = proposalStateFromLabel(proposal.state);
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
    });

    return NextResponse.json(
      {
        items,
        total: proposalData.total,
        limit: proposalData.limit,
        offset: proposalData.offset,
        hasMore: proposalData.hasMore,
        generatedAt: proposalData.generatedAt,
        source: 'indexer'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    // Indexer down: list from Governor state (docs/STORAGE_DIET.md § 8). Titles and vote totals
    // come from events, so rows read "Proposal N" until the indexer is back.
    try {
      const page = await chainProposalPage(rpcProposalReader(config), config.governorContractId, { limit, offset });
      const items = page.items
        .map((proposal): ProposalListItem => ({
          proposalId: proposal.proposalId,
          proposalNumber: proposal.proposalNumber,
          metadata: { title: `Proposal ${proposal.proposalNumber}`, description: '', url: '' },
          state: proposal.state,
          stateLabel: proposal.state === null ? 'Archived' : proposalStateLabel(proposal.state),
          ledger: 0,
          timestamp: proposal.voteStart,
          txHash: '',
          contractId: config.governorContractId,
          voteTotals: null
        }))
        .filter((item) => !status || item.stateLabel.toLowerCase() === status.toLowerCase());
      return NextResponse.json(
        {
          items,
          total: page.total,
          limit,
          offset,
          hasMore: page.hasMore,
          generatedAt: new Date().toISOString(),
          source: 'chain',
          message:
            'Titles and vote totals are unavailable right now. States come straight from the chain.' +
            (status ? ' The status filter is applied to each page after it is cut, so pages may run short.' : '')
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch {
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
}
