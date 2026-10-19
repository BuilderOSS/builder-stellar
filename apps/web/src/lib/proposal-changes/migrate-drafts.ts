import type { ProposalActionType, ProposalQueuedAction } from '@/lib/proposal-actions/types';

import { CHANGE_SOURCES, defaultSourceKey, legacySourceKey } from './change-request';

/** A datetime-local string ("2026-11-01T12:00", local time) as unix seconds, or the value unchanged. */
function expiryAsUnixSeconds(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text || /^\d+$/.test(text)) return text;
  const ms = new Date(text).getTime();
  return Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : text;
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

/** v3 asked for the why first (step 1) and the actions second; v4 asks for the changes first. */
const STEP_V3_TO_V4: Record<number, number> = { 1: 2, 2: 1, 3: 3 };

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
