import { expiryToUnixSeconds } from '@/lib/expiry-time';
import type { ProposalActionType, ProposalQueuedAction } from '@/lib/proposal-actions/types';

import { CHANGE_SOURCES, defaultSourceKey, legacySourceKey } from './change-request';

/** A datetime-local string ("2026-11-01T12:00", local time) as unix seconds, or the value unchanged. */
function expiryAsUnixSeconds(value: unknown) {
  const text = String(value ?? '').trim();
  const seconds = expiryToUnixSeconds(text);
  return seconds === null ? text : String(seconds);
}

/**
 * A v3 queued action as v4: every action names the page it came from, and an open-pool closing time is
 * unix seconds, so it no longer depends on the time zone of the browser that serializes it.
 */
export function migrateActionV3(action: ProposalQueuedAction, prepopulatedFrom?: string): ProposalQueuedAction {
  const fallback = defaultSourceKey(action.type as ProposalActionType);
  const legacy = legacySourceKey(prepopulatedFrom);
  // The type names its page better than the draft-wide `prepopulatedFrom`, which only kept the last page.
  const sourceKey = fallback === 'membership' && legacy ? legacy : fallback;
  const migrated: ProposalQueuedAction = {
    ...action,
    source: action.source ?? CHANGE_SOURCES[sourceKey],
    note: typeof action.note === 'string' ? action.note : ''
  };
  if (action.type === 'open-pool') migrated.expiresAt = expiryAsUnixSeconds(action.expiresAt);
  return migrated;
}

type DraftV3 = { queuedActions?: ProposalQueuedAction[]; prepopulatedFrom?: string; [key: string]: unknown };

/** The composer's steps: 1 writes the why and the changes, in either order; 2 reviews and signs. */
export type ComposerStep = 1 | 2;

/** Any saved step as one of today's two. Anything past writing is Review. */
export function clampComposerStep(step: unknown): ComposerStep {
  return typeof step === 'number' && step >= 2 ? 2 : 1;
}

/** v3 had three steps (why, actions, review); the first two are now one page. */
const STEP_V3_TO_V4: Record<number, ComposerStep> = { 1: 1, 2: 1, 3: 2 };

export function migrateDraftV3<T extends DraftV3>(draft: T): Omit<T, 'prepopulatedFrom'> {
  const { prepopulatedFrom, ...rest } = draft;
  const queued = Array.isArray(draft.queuedActions) ? draft.queuedActions : [];
  const step = typeof draft.step === 'number' ? (STEP_V3_TO_V4[draft.step] ?? 1) : draft.step;
  return {
    ...rest,
    ...(step === undefined ? {} : { step }),
    queuedActions: queued.map((action) => migrateActionV3(action, prepopulatedFrom))
  } as Omit<T, 'prepopulatedFrom'>;
}

export function migrateDraftsV3(
  draftsByWallet: Record<string, Record<string, DraftV3>> | undefined
): Record<string, Record<string, Omit<DraftV3, 'prepopulatedFrom'>>> {
  return Object.fromEntries(
    Object.entries(draftsByWallet ?? {}).map(([wallet, drafts]) => [
      wallet,
      Object.fromEntries(Object.entries(drafts ?? {}).map(([daoId, draft]) => [daoId, migrateDraftV3(draft)]))
    ])
  );
}
