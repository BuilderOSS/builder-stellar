export const ProposalState = {
  Pending: 0,
  Active: 1,
  Defeated: 2,
  Canceled: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7
} as const;

export type ProposalState = (typeof ProposalState)[keyof typeof ProposalState];

export type ProposalActionMode = 'vote' | 'queue' | 'execute' | 'outcome';

export function proposalStateLabel(state: ProposalState | null | undefined) {
  return Object.entries(ProposalState).find(([, value]) => value === state)?.[0] ?? 'Unknown';
}

export function proposalStateFromLabel(label: string | null | undefined): ProposalState | null {
  if (!label) {
    return null;
  }

  const normalized = label.trim().toLowerCase();
  const entry = Object.entries(ProposalState).find(([key]) => key.toLowerCase() === normalized);
  return entry?.[1] ?? null;
}

export function proposalActionMode(state: ProposalState | null | undefined): ProposalActionMode {
  switch (state) {
    case ProposalState.Active:
      return 'vote';
    case ProposalState.Succeeded:
      return 'queue';
    case ProposalState.Queued:
      return 'execute';
    default:
      return 'outcome';
  }
}

export type ProposalStateTone = 'live' | 'success' | 'warning' | 'danger' | 'neutral';

/** Chip tone for a proposal state label (always shown with its word). */
export function proposalStateTone(label: string): ProposalStateTone {
  switch (label) {
    case 'Pending':
    case 'Active':
      return 'live';
    case 'Succeeded':
    case 'Executed':
      return 'success';
    case 'Queued':
      return 'warning';
    case 'Defeated':
      return 'danger';
    default:
      return 'neutral';
  }
}
