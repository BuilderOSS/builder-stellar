import type { UpgradeModule } from '@/lib/admin-module-versions';
import { releaseNote } from '@/lib/release-notes';

/** What `readAdminModuleVersion` returns, reduced to what update decisions need. */
export type ModuleVersionState = {
  module: UpgradeModule;
  version: string;
  fromHash: string;
  source: { revoked: boolean } | null;
  target: { version: string; hash: string; revoked: boolean } | null;
  approved: boolean;
};

export type ModuleUpdateStatus =
  /** On the latest release, or no newer usable release exists. */
  | 'current'
  /** A newer release is approved for this exact path. */
  | 'available'
  /** A newer release exists but the Manager hasn't approved this community's path to it. */
  | 'not-approved'
  /** The running version was withdrawn (revoked); a pending DAO can't launch on it. */
  | 'withdrawn';

export type ModuleUpdate = {
  module: UpgradeModule;
  status: ModuleUpdateStatus;
  current: string;
  /** Present when there is somewhere to go (available, or withdrawn with an approved fix). */
  next: { version: string; hash: string } | null;
  fromHash: string;
};

export const MODULE_LABELS: Record<UpgradeModule, string> = {
  token: 'Membership token',
  governor: 'Proposals and votes',
  treasury: 'Treasury',
  auction: 'Auction',
  marketplace: 'Market',
  metadata: 'Artwork and profile'
};

const IN_SENTENCE: Record<UpgradeModule, string> = {
  token: 'the membership token',
  governor: 'proposals and votes',
  treasury: 'the treasury',
  auction: 'the auction',
  marketplace: 'the market',
  metadata: 'artwork and profile'
};

/** A module named inside a sentence, in sentence case: "Upgrade the auction to 0.2.0". */
export function moduleLabelInSentence(module: UpgradeModule) {
  return IN_SENTENCE[module];
}

/** Order modules appear in, most member-facing first. */
export const MODULE_ORDER: UpgradeModule[] = ['token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata'];

/**
 * The Treasury runs every proposal's calls, so an upgrade of itself only takes effect after the run
 * that applies it: later calls in the same proposal would still use its old code. It upgrades in its
 * own proposal. The Governor is done with a proposal before the Treasury makes its calls, so it
 * batches safely with the rest (covered by `comment_modules_upgrade_by_proposal_keeps_live_state`).
 */
export const SELF_UPGRADING: UpgradeModule[] = ['treasury'];

export function classifyModule(state: ModuleVersionState): ModuleUpdate {
  const { target } = state;
  const usable = Boolean(target && !target.revoked && target.hash !== state.fromHash);
  const next = usable && state.approved ? { version: target!.version, hash: target!.hash } : null;
  const status: ModuleUpdateStatus = state.source?.revoked
    ? 'withdrawn'
    : !usable
      ? 'current'
      : state.approved
        ? 'available'
        : 'not-approved';
  return { module: state.module, status, current: state.version, next, fromHash: state.fromHash };
}

/** The updates a community can act on, grouped the way they should be applied or proposed. */
export function planModuleUpdates(updates: ModuleUpdate[]) {
  const actionable = updates.filter((update) => update.next);
  return {
    actionable,
    withdrawn: updates.filter((update) => update.status === 'withdrawn'),
    /** One proposal for everything except the Treasury. */
    batch: actionable.filter((update) => !SELF_UPGRADING.includes(update.module)),
    /** Each in its own proposal. */
    separate: actionable.filter((update) => SELF_UPGRADING.includes(update.module))
  };
}

/** "a", "a and b", "a, b and c". */
function listInSentence(items: string[]) {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Title and description for a proposal that applies these upgrades. A batch names every contract
 * it touches, and the description carries each one's release notes, so voters see the whole change.
 */
export function upgradeProposalMetadata(updates: ModuleUpdate[]) {
  const actionable = updates.filter((update) => update.next);
  const versions = [...new Set(actionable.map((update) => update.next!.version))];
  const names = listInSentence(actionable.map((update) => moduleLabelInSentence(update.module)));
  const title =
    versions.length === 1 ? `Upgrade ${names} to ${versions[0]}` : `Upgrade ${names} to their latest releases`;
  const notes = actionable.map((update) => {
    const note = releaseNote(update.module, update.next!.version) ?? 'No release notes for this version yet.';
    return actionable.length === 1
      ? note
      : `${MODULE_LABELS[update.module]} ${update.current} → ${update.next!.version}: ${note}`;
  });
  return { title, description: notes.join('\n\n'), url: '' };
}
