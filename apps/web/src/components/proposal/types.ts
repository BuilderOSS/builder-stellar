import type { ProposalCallArgs } from '@/lib/proposal-call';
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
  state: ProposalState;
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
};

export type ProposalListResponse = {
  items: ProposalListItem[];
  generatedAt: string;
  message?: string;
};
