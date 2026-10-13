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
const ARTWORK_SETTINGS = new Set(['set-artwork-renderer']);

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
    case 'open-claim-list':
      // Every list is its own (non-idempotent) resource, even with an identical payload.
      return `claims:${action.claimsContractId}:list:${action.id}`;
    case 'change-mint-allowance':
      // Allowance changes add up: two for one module are two resources.
      return `token:allowance:${String(action.module || action.recipient)
        .trim()
        .toUpperCase()}:${action.id}`;
    case 'set-transfers-locked':
    case 'set-members-only-delegation':
    case 'set-dao-recovery':
      return `token:${action.type}`;
    case 'set-transfer-agent':
      return `token:agent:${String(action.module || action.recipient)
        .trim()
        .toUpperCase()}`;
    case 'dao-transfer':
    case 'approved-transfer':
      // Any move of one token, by any path, is one resource.
      return `token:transfer:${String(action.tokenId ?? '').trim()}`;
    case 'open-pool':
      return `marketplace:pool:open:${action.id}`;
    case 'close-pool':
    case 'sweep-pool':
      return `marketplace:${action.type}:${String(action.poolId ?? '').trim()}`;
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
    case 'update-dao-profile':
      // One profile per community: two updates in one proposal conflict (the
      // second would fail its revision check).
      return 'metadata:profile';
    case 'change-dao-slug':
      return 'manager:slug';
    case 'transfer-dao-token':
      return `token:transfer:${String(action.tokenId ?? '').trim()}`;
    case 'set-auction-payment-token':
      return 'auction:payment-token';
    case 'set-auction-duration':
      return 'auction:duration';
    case 'set-auction-time-buffer':
      return 'auction:time-buffer';
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
    action.type === 'change-dao-slug' ||
    action.type === 'upgrade-dao-module' ||
    action.type === 'add-artwork-properties' ||
    action.type === 'open-claim-list' ||
    action.type === 'open-pool' ||
    action.type === 'update-dao-profile' ||
    action.type === 'set-transfers-locked' ||
    action.type === 'set-members-only-delegation' ||
    action.type === 'set-dao-recovery' ||
    action.type === 'set-transfer-agent' ||
    action.type === 'dao-transfer' ||
    action.type === 'approved-transfer' ||
    ARTWORK_SETTINGS.has(action.type)
  );
}

/** Why a high-risk action deserves a second look, in members' words. */
function highRiskMessage(action: ProposalQueuedAction) {
  if (action.type === 'upgrade-dao-module')
    return 'Replaces this contract’s code. The contract checks the upgrade is approved when the proposal runs; an unapproved one fails and changes nothing.';
  if (action.type === 'set-transfers-locked' && action.enabled === true)
    return 'Locks memberships: members can no longer sell their tokens, only give them back to the DAO or ask for a vote.';
  if (action.type === 'set-dao-recovery' && action.enabled === true)
    return 'Lets a vote move any member’s token without their signature.';
  if (action.type === 'dao-transfer') return 'Moves a member’s token and its votes without the member’s signature.';
  return 'This action can change DAO control, treasury behavior, or token balances.';
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
        message: highRiskMessage(action),
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

  // A link change can fail at execution if someone takes the slug first, which reverts every
  // action in the proposal; keep it on its own.
  const slugChanges = existing.flatMap((candidate, index) => (candidate.type === 'change-dao-slug' ? [index] : []));
  const bundlesSlugChange =
    action.type === 'change-dao-slug'
      ? existing.some((candidate) => candidate.type !== 'change-dao-slug')
      : slugChanges.length > 0;
  if (bundlesSlugChange)
    findings.push({
      severity: 'warning',
      kind: 'order',
      message:
        'Propose a link change on its own: if the new link is taken before the vote passes, every action in this proposal fails.',
      existingActionIndexes: action.type === 'change-dao-slug' ? [] : slugChanges
    });

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
      message: highRiskMessage(action),
      existingActionIndexes: []
    });
  }

  return findings;
}
