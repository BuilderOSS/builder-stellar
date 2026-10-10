import type { UpgradeModule } from '@/lib/admin-module-versions';

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
  governor: 'Voting',
  treasury: 'Treasury',
  auction: 'Auction',
  marketplace: 'Market',
  metadata: 'Artwork and profile'
};

/** Order modules appear in, most member-facing first. */
export const MODULE_ORDER: UpgradeModule[] = ['token', 'governor', 'treasury', 'auction', 'marketplace', 'metadata'];

/**
 * These two run proposals themselves, so they upgrade in their own proposal rather than inside a
 * batch that also changes other contracts.
 */
export const SELF_GOVERNING: UpgradeModule[] = ['governor', 'treasury'];

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
    /** One proposal for everything that isn't a self-governing contract. */
    batch: actionable.filter((update) => !SELF_GOVERNING.includes(update.module)),
    /** Each in its own proposal. */
    separate: actionable.filter((update) => SELF_GOVERNING.includes(update.module))
  };
}
