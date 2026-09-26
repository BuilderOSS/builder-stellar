import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';

export type ProposalActionIdentity = {
  key: string;
  resourceKey: string;
  normalizedArgs: Record<string, unknown>;
};

export type ProposalDraftFinding = {
  severity: 'warning' | 'error';
  kind: 'duplicate' | 'conflict' | 'high-risk';
  message: string;
  existingActionIndexes: number[];
};

const ADDRESS_FIELDS = new Set(['recipient', 'authority', 'paymentToken', 'assetContractId']);
const IGNORED_FIELDS = new Set(['id']);

function normalizeValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (ADDRESS_FIELDS.has(key)) return trimmed.toUpperCase();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed.replace(/^(-?)0+(?=\d)/, '$1');
    return trimmed;
  }

  if (Array.isArray(value)) return value.map((item) => normalizeValue(key, item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([childKey]) => !IGNORED_FIELDS.has(childKey))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([childKey, childValue]) => [childKey, normalizeValue(childKey, childValue)])
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

export function getProposalActionIdentity(action: ProposalQueuedAction): ProposalActionIdentity {
  const normalizedArgs = Object.fromEntries(
    Object.entries(action)
      .filter(([key]) => !IGNORED_FIELDS.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, normalizeValue(key, value)])
  );

  const resourceKey = getProposalActionResourceKey(action);
  return {
    key: `${resourceKey}:${stableStringify(normalizedArgs)}`,
    resourceKey,
    normalizedArgs
  };
}

export function getProposalActionResourceKey(action: ProposalQueuedAction): string {
  switch (action.type) {
    case 'set-mint-authority':
    case 'set-governor-authority':
      return `${action.type}:${String(action.authority || action.recipient)
        .trim()
        .toUpperCase()}`;
    case 'set-voting-delay':
    case 'set-voting-period':
    case 'set-proposal-threshold':
    case 'set-quorum-bps':
      return action.type;
    case 'pause-auction':
    case 'unpause-auction':
      return 'auction:pause-state';
    case 'batch-mint-governance-token':
    case 'mint-governance-token':
      return `mint:${String(action.recipient).trim().toUpperCase()}`;
    case 'transfer-sac-token':
      return `transfer:${String(action.assetContractId || action.assetCode || '')
        .trim()
        .toUpperCase()}:${String(action.recipient).trim().toUpperCase()}`;
    case 'set-auction-reserve-price':
      return 'auction:reserve-price';
    case 'set-auction-payment-token':
      return 'auction:payment-token';
    default:
      return action.type;
  }
}

export function isHighRiskProposalAction(action: ProposalQueuedAction) {
  return (
    action.type.includes('authority') ||
    action.type.includes('mint') ||
    action.type === 'transfer-sac-token' ||
    action.type === 'pause-auction' ||
    action.type === 'unpause-auction'
  );
}

export function analyzeProposalAction(action: ProposalQueuedAction, existing: ProposalQueuedAction[]) {
  const identity = getProposalActionIdentity(action);
  const findings: ProposalDraftFinding[] = [];

  existing.forEach((candidate, index) => {
    const candidateIdentity = getProposalActionIdentity(candidate);
    if (candidateIdentity.key === identity.key) {
      findings.push({
        severity: 'error',
        kind: 'duplicate',
        message: 'This exact action is already in the proposal draft.',
        existingActionIndexes: [index]
      });
      return;
    }

    if (candidateIdentity.resourceKey !== identity.resourceKey) return;
    findings.push({
      severity: 'error',
      kind: 'conflict',
      message: 'Another action in this draft changes the same resource to a different value.',
      existingActionIndexes: [index]
    });
  });

  if (isHighRiskProposalAction(action)) {
    findings.push({
      severity: 'warning',
      kind: 'high-risk',
      message: 'This action can change DAO control, treasury behavior, or token balances.',
      existingActionIndexes: []
    });
  }

  return findings;
}
