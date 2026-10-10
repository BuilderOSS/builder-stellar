import type { ProposalCallArgs } from '@/lib/proposal-call';
import type { ProposalExecutionReceipt } from '@/lib/proposal-execution-receipt';
import type { ProposalMetadata } from '@/lib/proposal-metadata';
import type { ProposalState } from '@/lib/proposal-state';

export type ProposalDetail = {
  proposalId: string;
  proposalNumber: number;
  metadata: ProposalMetadata;
  proposer: string;
  description: string;
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
  vote_end: number;
  vote_snapshot: number;
  vote_start: number;
  eta: number;
  deadline: number;
  state: ProposalState | null;
  stateSource: 'chain' | 'indexed';
  voteStartSource: 'chain' | 'indexed' | 'unavailable';
  etaSource: 'chain' | 'indexed' | 'unavailable';
  expiresAt: number | null;
  for_votes: string;
  against_votes: string;
  abstain_votes: string;
  executionReceipt: ProposalExecutionReceipt | null;
  executionReceiptStatus: 'available' | 'pending' | 'unavailable' | 'not-applicable';
  label: string;
  quorumVotes: string | null;
};

export type ProposalVoteItem = {
  id: string;
  proposalId: string;
  voter: string;
  support: number;
  weight: string;
  reason: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

export type ProposalListItem = {
  proposalId: string;
  proposalNumber: number;
  metadata: ProposalMetadata;
  state: ProposalState | null;
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

export type ProposalListResponse = {
  items: ProposalListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  generatedAt: string;
  message?: string;
};
