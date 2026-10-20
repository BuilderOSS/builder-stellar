import type { ProposalActionType, ProposalQueuedAction } from '@/lib/proposal-actions/types';

/** Where an action was made: the page a member can go back to and edit it. */
export type ActionSurface = 'manage' | 'treasury' | 'claims' | 'marketplace' | 'composer';

export type ActionSource = {
  surface: ActionSurface;
  /** "Manage → Voting rules", shown on the action's source chip. */
  label: string;
  /** The page's path inside the tribe, for `daoRoute(routeId, href)`. Never a full URL: the tribe's link can change. */
  href: string;
};

/** Steps that only work together (pause → change → resume) go into and come out of a proposal as one item. */
export type ActionBundle = { id: string; label: string };

/**
 * One shape for every page that adds to a proposal: what runs, where it was made, and a plain-language
 * note that becomes part of "What this does".
 */
export type ActionRequest = {
  actions: ProposalQueuedAction[];
  bundle?: ActionBundle;
  source: ActionSource;
  note: string;
  /**
   * Ids of queued actions this request edits (the `?action=` round trip). Their place in the queue is kept,
   * and a bundle being edited is replaced as a whole.
   */
  replaces?: string[];
};

/** The fields a request stamps on each queued action. Never part of the call itself. */
export const ACTION_META_FIELDS = ['source', 'note', 'bundleId', 'bundleLabel'] as const;

/** The action's call data, without where it came from: what identity and duplicate checks compare. */
export function withoutActionMeta(action: ProposalQueuedAction): ProposalQueuedAction {
  const { source: _source, note: _note, bundleId: _bundleId, bundleLabel: _bundleLabel, ...call } = action;
  // A starting price's asset is only there to read "to 150 XLM"; the call sends the number alone.
  if (call.type === 'set-auction-reserve-price') {
    const { assetCode: _assetCode, ...price } = call;
    return price as ProposalQueuedAction;
  }
  return call as ProposalQueuedAction;
}

/**
 * The request's actions, each carrying its source, note and bundle. An action that already has its own note
 * (one of several unrelated actions made together) keeps it.
 */
export function stampAction(request: ActionRequest): ProposalQueuedAction[] {
  return request.actions.map((action) => ({
    ...action,
    source: request.source,
    // A bundle reads as one item with one note; separate actions made together may each bring their own.
    note: !request.bundle && typeof action.note === 'string' && action.note ? action.note : request.note,
    ...(request.bundle ? { bundleId: request.bundle.id, bundleLabel: request.bundle.label } : {})
  }));
}

/** "Change the auction: 4 steps" */
export function bundleLabel(title: string, steps: number) {
  return `${title}: ${steps} ${steps === 1 ? 'step' : 'steps'}`;
}

/** A bundle for a multi-step plan, or none for a single step (one step reads as itself). */
export function planBundle(title: string, steps: number): ActionBundle | undefined {
  return steps > 1 ? { id: crypto.randomUUID(), label: bundleLabel(title, steps) } : undefined;
}

// Producer pages, as action sources. Labels follow the Manage navigation (lib/manage-sections.ts).
export const ACTION_SOURCES = {
  composer: { surface: 'composer', label: 'Proposal', href: 'proposals/create' },
  profile: { surface: 'manage', label: 'Manage → Tribe profile', href: 'admin/profile' },
  token: { surface: 'manage', label: 'Manage → Mint tokens', href: 'admin/token' },
  artwork: { surface: 'manage', label: 'Manage → Artwork', href: 'admin/artwork' },
  governance: { surface: 'manage', label: 'Manage → Voting rules', href: 'admin/governance' },
  membership: { surface: 'manage', label: 'Manage → Membership', href: 'admin/owner' },
  auction: { surface: 'manage', label: 'Manage → Auction', href: 'admin/auction' },
  marketplace: { surface: 'marketplace', label: 'Manage → Market', href: 'admin/marketplace' },
  upgrades: { surface: 'manage', label: 'Manage → Contract upgrades', href: 'admin/upgrades' },
  claims: { surface: 'claims', label: 'Manage → Claim lists', href: 'admin/claims' },
  treasury: { surface: 'treasury', label: 'Treasury', href: 'treasury' }
} as const satisfies Record<string, ActionSource>;

export type ActionSourceKey = keyof typeof ACTION_SOURCES;

/** The page an action type is normally made on, for actions that arrived without a source (v3 drafts). */
export function defaultSourceKey(type: ProposalActionType): ActionSourceKey {
  switch (type) {
    case 'mint-governance-token':
    case 'batch-mint-governance-token':
      return 'token';
    case 'transfer-sac-token':
    case 'transfer-dao-token':
      return 'treasury';
    case 'set-voting-delay':
    case 'set-voting-period':
    case 'set-queue-delay':
    case 'set-proposal-threshold':
    case 'set-quorum-bps':
      return 'governance';
    case 'pause-auction':
    case 'unpause-auction':
    case 'set-auction-duration':
    case 'set-auction-time-buffer':
    case 'set-auction-reserve-price':
    case 'set-auction-payment-token':
    case 'set-auction-min-bid-increment':
    case 'cancel-auction':
      return 'auction';
    case 'set-marketplace-payment-token':
    case 'set-marketplace-secondary-fee':
    case 'pause-marketplace':
    case 'unpause-marketplace':
    case 'open-pool':
    case 'close-pool':
    case 'sweep-pool':
    case 'treasury-authorize':
    case 'treasury-buy-listing':
      return 'marketplace';
    case 'add-artwork-properties':
    case 'set-artwork-renderer':
    case 'regenerate-token-traits':
      return 'artwork';
    case 'update-dao-profile':
    case 'set-token-metadata':
    case 'change-dao-slug':
      return 'profile';
    case 'upgrade-dao-module':
    case 'migrate-dao-module':
      return 'upgrades';
    case 'open-claim-list':
      return 'claims';
    default:
      return 'membership';
  }
}

/** The legacy free-text `prepopulatedFrom` of a v3 draft, as a source, when it names a known page. */
export function legacySourceKey(prepopulatedFrom: string | undefined): ActionSourceKey | null {
  const text = (prepopulatedFrom ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text.startsWith('marketplace')) return 'marketplace';
  if (text.startsWith('treasury')) return 'treasury';
  if (text.startsWith('claims')) return 'claims';
  const section = /^admin\/([a-z-]+)/.exec(text)?.[1];
  if (section === 'membership' || section === 'owner') return 'membership';
  if (section && section in ACTION_SOURCES) return section as ActionSourceKey;
  return null;
}

/** The URL parameter that names the queued action a page should load for editing. */
export const ACTION_PARAM = 'action';

/** The page to edit a queued action on, with the action loaded: `admin/governance?action=<id>`. */
export function actionEditHref(action: ProposalQueuedAction) {
  const source = action.source as ActionSource | undefined;
  if (!source || source.surface === 'composer') return null;
  const separator = source.href.includes('?') ? '&' : '?';
  return `${source.href}${separator}${ACTION_PARAM}=${encodeURIComponent(action.id)}`;
}
