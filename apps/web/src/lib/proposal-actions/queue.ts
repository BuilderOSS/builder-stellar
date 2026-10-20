import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';

/** One row of the queue: a single action, or a bundle's steps together. */
export type QueueItem = {
  /** The bundle id, or the action id for a single action. */
  key: string;
  bundleId?: string;
  bundleLabel?: string;
  actions: ProposalQueuedAction[];
  /** Index of the item's first action in the flat queue. */
  start: number;
};

/** The queue as rows: a bundle's steps stay one row as long as they sit next to each other. */
export function queueItems(actions: ProposalQueuedAction[]): QueueItem[] {
  const items: QueueItem[] = [];
  actions.forEach((action, index) => {
    const bundleId = typeof action.bundleId === 'string' && action.bundleId ? action.bundleId : undefined;
    const last = items.at(-1);
    if (bundleId && last?.bundleId === bundleId) {
      last.actions.push(action);
      return;
    }
    items.push({
      key: bundleId ?? action.id,
      bundleId,
      bundleLabel: bundleId ? String(action.bundleLabel ?? '') : undefined,
      actions: [action],
      start: index
    });
  });
  return items;
}

/** Move one row (with all its steps) to another row's place. */
export function moveQueueItem(actions: ProposalQueuedAction[], from: number, to: number): ProposalQueuedAction[] {
  const items = queueItems(actions);
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return actions;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.flatMap((item) => item.actions);
}

/** Every id a replace or remove touches: an action inside a bundle takes its whole bundle with it. */
export function expandToBundles(actions: ProposalQueuedAction[], ids: string[]) {
  const wanted = new Set(ids);
  const bundles = new Set(
    actions.filter((action) => wanted.has(action.id) && action.bundleId).map((action) => String(action.bundleId))
  );
  return new Set(
    actions
      .filter((action) => wanted.has(action.id) || (action.bundleId && bundles.has(String(action.bundleId))))
      .map((action) => action.id)
  );
}

/**
 * Swap queued actions for new ones, at the place of the first one replaced, so an edit keeps its position.
 * Nothing found to replace appends instead.
 */
export function replaceInQueue(
  actions: ProposalQueuedAction[],
  ids: string[],
  replacements: ProposalQueuedAction[]
): ProposalQueuedAction[] {
  const removed = expandToBundles(actions, ids);
  const at = actions.findIndex((action) => removed.has(action.id));
  if (at < 0) return [...actions, ...replacements];
  const kept = actions.filter((action) => !removed.has(action.id));
  const before = actions.slice(0, at).filter((action) => !removed.has(action.id)).length;
  return [...kept.slice(0, before), ...replacements, ...kept.slice(before)];
}

export function removeFromQueue(actions: ProposalQueuedAction[], ids: string[]) {
  const removed = expandToBundles(actions, ids);
  return actions.filter((action) => !removed.has(action.id));
}

/** How many separate things the proposal does: a bundle counts once. */
export function queuedActionCount(actions: ProposalQueuedAction[]) {
  return queueItems(actions).length;
}

export function actionCountText(actions: ProposalQueuedAction[]) {
  const count = queuedActionCount(actions);
  return `${count} ${count === 1 ? 'change' : 'changes'}`;
}
