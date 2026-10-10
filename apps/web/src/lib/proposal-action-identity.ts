import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';

export type ProposalActionIdentity = {
  key: string;
  resourceKey: string;
  normalizedArgs: Record<string, unknown>;
};

export type ProposalDraftFinding = {
  severity: 'warning' | 'error';
  kind: 'duplicate' | 'conflict' | 'high-risk' | 'order';
  message: string;
  existingActionIndexes: number[];
};

const ADDRESS_FIELDS = new Set(['recipient', 'authority', 'paymentToken', 'assetContractId']);
const IGNORED_FIELDS = new Set(['id']);
const HASH_FIELDS = new Set(['fromHash', 'toHash', 'root']);
const ARTWORK_STRING_FIELDS = new Set(['names', 'name', 'base_uri', 'extension']);
const ARTWORK_SETTINGS = new Set([
  'set-artwork-renderer',
  'set-artwork-description',
  'set-artwork-project-uri',
  'set-artwork-contract-image'
]);

function normalizeValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    // Hashes are 32-byte values even when their hex spelling contains only
    // digits. Artwork strings are exact ABI values, not numeric strings.
    if (HASH_FIELDS.has(key)) return value.trim().toLowerCase();
    if (ARTWORK_STRING_FIELDS.has(key)) return value;
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
  if (ARTWORK_SETTINGS.has(action.type)) normalizedArgs.value = action.value;
  return {
    key: `${resourceKey}:${stableStringify(normalizedArgs)}`,
    resourceKey,
    normalizedArgs
  };
}

export function getProposalActionResourceKey(action: ProposalQueuedAction): string {
  switch (action.type) {
    case 'set-merkle-root':
    case 'set-allowlist':
      return `minter:${action.minterContractId}:${action.tokenContractId}:${action.type}`;
    case 'minter-batch-mint':
      return `minter:${action.minterContractId}:${action.tokenContractId}:batch:${action.id}`;
    case 'set-mint-authority':
      return `${action.type}:${String(action.authority || action.recipient)
        .trim()
        .toUpperCase()}`;
    case 'set-voting-delay':
    case 'set-voting-period':
    case 'set-queue-delay':
    case 'set-proposal-threshold':
    case 'set-quorum-bps':
      return action.type;
    case 'pause-auction':
    case 'unpause-auction':
      return 'auction:pause-state';
    case 'pause-marketplace':
    case 'unpause-marketplace':
      return 'marketplace:pause-state';
    case 'upgrade-dao-module':
      return `upgrade:${String(action.module).trim().toLowerCase()}`;
    case 'add-artwork-properties':
      // Append calls allocate new property/IPFS reference slots in execution
      // order. Even identical payloads are distinct, non-idempotent batches.
      return `artwork:append:${action.id}`;
    case 'batch-mint-governance-token':
    case 'mint-governance-token':
      return `mint:${String(action.recipient).trim().toUpperCase()}`;
    case 'transfer-sac-token':
      return `transfer:${String(action.assetContractId || action.assetCode || '')
        .trim()
        .toUpperCase()}:${String(action.recipient).trim().toUpperCase()}`;
    case 'set-auction-reserve-price':
      return 'auction:reserve-price';
    case 'set-token-metadata':
      return 'token:metadata';
    case 'transfer-dao-token':
      return `token:transfer:${String(action.tokenId ?? '').trim()}`;
    case 'set-auction-payment-token':
      return 'auction:payment-token';
    case 'set-auction-duration':
      return 'auction:duration';
    case 'set-auction-time-buffer':
      return 'auction:time-buffer';
    case 'create-primary-listing':
      // Each distinct listing is its own resource; only an identical listing is a duplicate.
      return `marketplace:create-primary:${String(action.price || '').trim()}:${String(action.expiresAt || '').trim()}`;
    case 'cancel-primary-listing':
      return `marketplace:cancel-primary:${String(action.listingId || '').trim()}`;
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
    action.type === 'unpause-auction' ||
    action.type === 'pause-marketplace' ||
    action.type === 'unpause-marketplace' ||
    action.type === 'set-marketplace-payment-token' ||
    action.type === 'set-auction-payment-token' ||
    action.type === 'set-token-metadata' ||
    action.type === 'transfer-dao-token' ||
    action.type === 'upgrade-dao-module' ||
    action.type === 'add-artwork-properties' ||
    action.type === 'set-merkle-root' ||
    action.type === 'set-allowlist' ||
    action.type === 'minter-batch-mint' ||
    ARTWORK_SETTINGS.has(action.type)
  );
}

const PAUSE_TOGGLES = new Set(['pause-auction', 'unpause-auction', 'pause-marketplace', 'unpause-marketplace']);
/** Auction calls the contract only accepts while auctions are paused. */
const NEEDS_PAUSED_AUCTION = new Set([
  'set-auction-reserve-price',
  'set-auction-payment-token',
  'set-auction-duration',
  'set-auction-time-buffer',
  'set-auction-min-bid-increment',
  'cancel-auction'
]);

/** Index of the nearest earlier action that pauses or resumes the same module, or -1. */
function lastToggleIndex(resourceKey: string, existing: ProposalQueuedAction[]) {
  for (let index = existing.length - 1; index >= 0; index -= 1) {
    if (getProposalActionResourceKey(existing[index]) === resourceKey) return index;
  }
  return -1;
}

export function analyzeProposalAction(action: ProposalQueuedAction, existing: ProposalQueuedAction[]) {
  const identity = getProposalActionIdentity(action);
  const findings: ProposalDraftFinding[] = [];

  // Pausing and resuming are ordered steps, not competing values: "pause → change → resume" is one
  // valid proposal. Only the same step twice in a row (with nothing undoing it in between) repeats.
  if (PAUSE_TOGGLES.has(action.type)) {
    const previous = lastToggleIndex(identity.resourceKey, existing);
    if (previous >= 0 && existing[previous].type === action.type)
      findings.push({
        severity: 'error',
        kind: 'duplicate',
        message: action.type.startsWith('pause')
          ? 'This already pauses at this point in the draft.'
          : 'This already resumes at this point in the draft.',
        existingActionIndexes: [previous]
      });
    if (isHighRiskProposalAction(action))
      findings.push({
        severity: 'warning',
        kind: 'high-risk',
        message: 'This action can change DAO control, treasury behavior, or token balances.',
        existingActionIndexes: []
      });
    return findings;
  }

  if (NEEDS_PAUSED_AUCTION.has(action.type)) {
    const previous = lastToggleIndex('auction:pause-state', existing);
    if (previous >= 0 && existing[previous].type === 'unpause-auction')
      findings.push({
        severity: 'warning',
        kind: 'order',
        message: 'This runs after auctions resume, but it needs them paused. Move it before the resume step.',
        existingActionIndexes: [previous]
      });
  }

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
