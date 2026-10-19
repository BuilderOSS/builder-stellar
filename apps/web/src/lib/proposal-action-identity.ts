import type { DaoNetworkConfig } from '@/lib/dao-config';
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
    case 'create-module':
      // One module of a kind at a number: two for the same number cannot both run.
      return `manager:module:${String(action.kind)}:${String(action.moduleNumber)}`;
    case 'register-module':
    case 'unregister-module':
      // Registering and unregistering one contract conflict.
      return `token:module:${String(action.address || action.recipient)
        .trim()
        .toUpperCase()}`;
    case 'open-module':
      return `module:open:${String(action.address || action.recipient)
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
    action.type === 'create-module' ||
    action.type === 'register-module' ||
    action.type === 'unregister-module' ||
    action.type === 'open-module' ||
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
  if (action.type === 'create-module' || action.type === 'register-module')
    return 'Adds a contract that can mint memberships within its allowance and hold members’ tokens.';
  if (action.type === 'unregister-module')
    return 'Takes a contract out of the tribe. Memberships it still holds become that contract’s own votes, and nobody can cast them.';
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

/**
 * What the draft rules know about the tribe as it is now, from the indexed config. Each field is
 * optional: a rule that needs an unknown value falls back to checking the draft alone.
 */
export type ProposalDraftState = Partial<
  Pick<
    DaoNetworkConfig,
    'auctionPaused' | 'tokenSettings' | 'auctionContractId' | 'marketplaceContractId' | 'claimsContractId'
  >
>;

const sameAddress = (a: unknown, b: unknown) =>
  Boolean(a) &&
  String(a).trim().toUpperCase() ===
    String(b ?? '')
      .trim()
      .toUpperCase();

/** The module a mint allowance, transfer agent or opening names. */
const moduleOf = (action: ProposalQueuedAction) => String(action.module || action.address || action.recipient || '');

/** Calls the Treasury makes on itself: `authorize` and its own upgrade or migration. */
const isTreasuryCall = (action: ProposalQueuedAction) =>
  action.type === 'treasury-authorize' ||
  ((action.type === 'upgrade-dao-module' || action.type === 'migrate-dao-module') && action.module === 'treasury');

/** The membership switches and the indexed setting each one changes. */
const SWITCH_SETTINGS: Partial<
  Record<ProposalQueuedAction['type'], keyof NonNullable<ProposalDraftState['tokenSettings']>>
> = {
  'set-transfers-locked': 'transfersLocked',
  'set-members-only-delegation': 'membersOnlyDelegation',
  'set-dao-recovery': 'daoRecovery'
};

const AUTHORIZE_LAST =
  'Authorizing applies to the action right after it, and nothing follows. Add the purchase after it, or remove it.';

/**
 * Modules the tribe has registered, as far as the index knows. A custom module can be registered
 * without showing here, so a miss is a warning, not an error.
 */
function knownModules(state: ProposalDraftState) {
  return [state.auctionContractId, state.marketplaceContractId, state.claimsContractId].filter(Boolean) as string[];
}

/** Whether the module at `address` is registered after the earlier actions run; null when the index cannot say. */
function moduleRegistered(address: string, existing: ProposalQueuedAction[], state?: ProposalDraftState) {
  for (let index = existing.length - 1; index >= 0; index -= 1) {
    const candidate = existing[index];
    if (candidate.type === 'register-module' && sameAddress(moduleOf(candidate), address)) return true;
    if (candidate.type === 'unregister-module' && sameAddress(moduleOf(candidate), address)) return false;
  }
  if (!state) return null;
  return knownModules(state).some((known) => sameAddress(known, address));
}

/** The module an action mints from when it opens: a pool's market, a claim list, a new auction. */
function mintingModule(action: ProposalQueuedAction, state?: ProposalDraftState): string | null | undefined {
  if (action.type === 'open-pool') return state?.marketplaceContractId || null;
  if (action.type === 'open-claim-list') return String(action.claimsContractId || '') || null;
  if (action.type === 'open-module' && action.kind === 'auction') return moduleOf(action);
  return undefined;
}

/** Prerequisites and ordering the contracts enforce when the proposal runs. */
function prerequisiteFindings(
  action: ProposalQueuedAction,
  existing: ProposalQueuedAction[],
  state?: ProposalDraftState
): ProposalDraftFinding[] {
  const findings: ProposalDraftFinding[] = [];
  const order = (severity: ProposalDraftFinding['severity'], message: string, existingActionIndexes: number[] = []) =>
    findings.push({ severity, kind: 'order', message, existingActionIndexes });
  const previous = existing.length - 1;

  // Treasury.execute hands an authorize's trees to the next action, which must be an outside call
  // (InvalidAuthorization, 7605 otherwise).
  if (previous >= 0 && existing[previous].type === 'treasury-authorize' && isTreasuryCall(action))
    order(
      'error',
      'The action before this authorizes the next outside call, and this one is the Treasury’s own. Put the purchase right after the authorization.',
      [previous]
    );
  if (action.type === 'treasury-buy-listing' && (previous < 0 || existing[previous].type !== 'treasury-authorize'))
    order(
      'error',
      'The treasury pays for a listing only with an authorization right before the purchase. Add it again from the Treasury page.'
    );

  // Auction setters and cancel run only while auctions are paused (`when_paused`).
  if (
    NEEDS_PAUSED_AUCTION.has(action.type) &&
    lastToggleIndex('auction:pause-state', existing) < 0 &&
    state?.auctionPaused !== true
  )
    order(
      'warning',
      state?.auctionPaused === false
        ? 'Auctions are running, and this needs them paused. Add Pause auctions before it.'
        : 'This needs auctions paused. Add Pause auctions before it unless they are paused already.'
    );

  // Opening a pool, a claim list or a new auction mints from that module's allowance.
  const minter = mintingModule(action, state);
  if (minter !== undefined) {
    const granted = existing.some(
      (candidate) =>
        candidate.type === 'change-mint-allowance' &&
        candidate.direction !== 'decrease' &&
        (minter === null || sameAddress(moduleOf(candidate), minter))
    );
    if (!granted)
      order(
        'warning',
        'This mints from the module’s allowance. Raise its mint allowance earlier in this proposal unless it already has enough.'
      );
  }

  // Allowances and transfer agents are for registered modules only (NotAModule, 7209).
  if (action.type === 'change-mint-allowance' || action.type === 'set-transfer-agent') {
    if (moduleRegistered(moduleOf(action), existing, state) === false)
      order(
        'warning',
        'This module is not registered with the tribe, so the proposal would fail. Register it earlier in this proposal.'
      );
  }

  // A membership switch set to the value it already has reverts (SettingUnchanged, 7217).
  const setting = SWITCH_SETTINGS[action.type];
  if (setting && typeof action.enabled === 'boolean' && state?.tokenSettings?.[setting] === action.enabled)
    order(
      'warning',
      action.enabled
        ? 'This is on already, and setting it again would fail the proposal.'
        : 'This is off already, and setting it again would fail the proposal.'
    );

  // A recovery transfer needs DAO recovery on (RecoveryOff, 7218).
  if (action.type === 'dao-transfer') {
    let recovery = state?.tokenSettings?.daoRecovery;
    let switchIndex = -1;
    for (let index = existing.length - 1; index >= 0; index -= 1) {
      if (existing[index].type === 'set-dao-recovery') {
        recovery = existing[index].enabled === true;
        switchIndex = index;
        break;
      }
    }
    if (recovery !== true)
      order(
        'warning',
        recovery === false
          ? 'DAO recovery is off at this point, so this transfer would fail. Turn DAO recovery on earlier in this proposal.'
          : 'This needs DAO recovery on. Turn it on earlier in this proposal unless it is on already.',
        switchIndex >= 0 ? [switchIndex] : []
      );
  }

  return findings;
}

/** Index of the nearest earlier action that pauses or resumes the same module, or -1. */
function lastToggleIndex(resourceKey: string, existing: ProposalQueuedAction[]) {
  for (let index = existing.length - 1; index >= 0; index -= 1) {
    if (getProposalActionResourceKey(existing[index]) === resourceKey) return index;
  }
  return -1;
}

export function analyzeProposalAction(
  action: ProposalQueuedAction,
  existing: ProposalQueuedAction[],
  state?: ProposalDraftState
) {
  const identity = getProposalActionIdentity(action);
  const findings: ProposalDraftFinding[] = prerequisiteFindings(action, existing, state);

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
    // Pausing a paused auction, or resuming a running one, reverts the whole proposal.
    if (previous < 0 && action.type.endsWith('-auction') && typeof state?.auctionPaused === 'boolean') {
      const pausing = action.type === 'pause-auction';
      if (state.auctionPaused === pausing)
        findings.push({
          severity: 'warning',
          kind: 'order',
          message: pausing
            ? 'Auctions are paused already, so pausing them again would fail the proposal.'
            : 'Auctions are running already, so resuming them would fail the proposal.',
          existingActionIndexes: []
        });
    }
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

/**
 * Every finding for a whole draft, in order: each action against the ones before it, then the
 * rules that need what follows (an authorize at the very end has nothing to apply to).
 */
export function analyzeProposalDraft(actions: ProposalQueuedAction[], state?: ProposalDraftState) {
  const findings = actions.flatMap((action, index) => analyzeProposalAction(action, actions.slice(0, index), state));
  if (actions.at(-1)?.type === 'treasury-authorize')
    findings.push({
      severity: 'error',
      kind: 'order',
      message: AUTHORIZE_LAST,
      existingActionIndexes: [actions.length - 1]
    });
  return findings;
}
