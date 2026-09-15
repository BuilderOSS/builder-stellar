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

export function proposalStateBadgeStyle(label: string) {
  switch (label) {
    case 'Pending':
      return { background: '#e5e7eb', color: '#111827' };
    case 'Active':
      return { background: '#dbeafe', color: '#1d4ed8' };
    case 'Defeated':
      return { background: '#fee2e2', color: '#991b1b' };
    case 'Succeeded':
      return { background: '#dcfce7', color: '#166534' };
    case 'Queued':
      return { background: '#fef3c7', color: '#92400e' };
    case 'Expired':
      return { background: '#f3f4f6', color: '#4b5563' };
    case 'Executed':
      return { background: '#ede9fe', color: '#6d28d9' };
    case 'Canceled':
      return { background: '#fce7f3', color: '#9d174d' };
    default:
      return { background: '#f3f4f6', color: '#374151' };
  }
}
