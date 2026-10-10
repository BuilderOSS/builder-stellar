import { ProposalState, type ProposalState as State } from '@/lib/proposal-state';

export function proposalActionAvailability(
  detail: {
    state: State | null;
    stateSource: 'chain' | 'indexed';
    proposer: string;
    vote_end: number;
    eta: number;
    expiresAt: number | null;
  },
  nowMs: number,
  source: string | null | undefined
) {
  const live = detail.stateSource === 'chain' && !!source;
  const unexpired = !!detail.expiresAt && nowMs < detail.expiresAt * 1000;
  return {
    vote: live && detail.state === ProposalState.Active && detail.vote_end > 0 && nowMs < detail.vote_end * 1000,
    cancel:
      live &&
      source === detail.proposer &&
      (detail.state === ProposalState.Pending ||
        (detail.state === ProposalState.Active && nowMs < detail.vote_end * 1000)),
    // Caller supplies the transaction fee, not ownership/approval authority.
    queue: live && detail.state === ProposalState.Succeeded && unexpired,
    execute: live && detail.state === ProposalState.Queued && detail.eta > 0 && nowMs >= detail.eta * 1000 && unexpired
  };
}
