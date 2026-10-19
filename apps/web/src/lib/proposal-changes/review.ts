import { analyzeProposalAction, type ProposalDraftFinding } from '@/lib/proposal-action-identity';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';

import { type ChangeRequest, stampChange, withoutChangeMeta } from './change-request';
import { expandToBundles, replaceInQueue } from './queue';

/** A finding about one new action, naming the queued actions it is about by id (indices move). */
export type ChangeFinding = ProposalDraftFinding & { actionId: string; existingIds: string[] };

/** What the member chooses when a change repeats or clashes with one already in the proposal. */
export type ChangeResolution = 'add' | 'replace' | 'keep' | 'skip';

const REVIEW_KINDS = new Set<ProposalDraftFinding['kind']>(['duplicate', 'conflict', 'high-risk']);

/** Findings for one action against the ones before it. Where a change came from never makes it different. */
export function analyzeAgainst(action: ProposalQueuedAction, before: ProposalQueuedAction[]) {
  return analyzeProposalAction(withoutChangeMeta(action), before.map(withoutChangeMeta));
}

/** Every queued action's findings against the actions before it, keyed by action id. */
export function analyzeQueue(actions: ProposalQueuedAction[]) {
  return new Map(actions.map((action, index) => [action.id, analyzeAgainst(action, actions.slice(0, index))]));
}

/** Where the change's actions go: the replaced actions' place, or the end. */
function projectedQueue(existing: ProposalQueuedAction[], request: ChangeRequest) {
  return request.replaces?.length ? replaceInQueue(existing, request.replaces, []) : existing;
}

/**
 * Put one action in place of the steps it clashes with. A step inside a bundle stays in its bundle, so
 * "starting price 80" swaps into "pause, starting price 50, resume" rather than breaking it apart.
 */
function replaceStep(queue: ProposalQueuedAction[], ids: string[], action: ProposalQueuedAction) {
  const wanted = new Set(ids);
  const at = queue.findIndex((candidate) => wanted.has(candidate.id));
  if (at < 0) return [...queue, action];
  const replaced = queue[at];
  const placed = replaced.bundleId
    ? { ...action, bundleId: replaced.bundleId, bundleLabel: replaced.bundleLabel }
    : action;
  return queue.flatMap((candidate, index) => (index === at ? [placed] : wanted.has(candidate.id) ? [] : [candidate]));
}

/** What adding this change finds: duplicates, clashes, high-risk steps and order problems. */
export function reviewChange(request: ChangeRequest, existing: ProposalQueuedAction[]) {
  const base = projectedQueue(existing, request);
  const projected = [...base];
  const findings: ChangeFinding[] = [];
  for (const action of request.actions) {
    for (const finding of analyzeAgainst(action, projected))
      findings.push({
        ...finding,
        actionId: action.id,
        existingIds: finding.existingActionIndexes.map((index) => projected[index]?.id).filter(Boolean) as string[]
      });
    projected.push(action);
  }
  // Findings against the queue already there ask the member; within a bundle, the producer already ordered it.
  const existingIds = new Set(base.map((action) => action.id));
  const needsReview = findings.some(
    (finding) =>
      REVIEW_KINDS.has(finding.kind) &&
      (finding.kind === 'high-risk' || finding.existingIds.some((id) => existingIds.has(id)))
  );
  return { findings, needsReview };
}

/**
 * The queue after adding a change. `replace` puts each clashing action in place of what it clashes with;
 * `keep` adds everything but exact repeats; `skip` adds only what neither repeats nor clashes. A bundle
 * goes in whole or not at all, since its steps only work together.
 */
export function resolveChange(
  request: ChangeRequest,
  existing: ProposalQueuedAction[],
  findings: ChangeFinding[],
  resolution: ChangeResolution
): ProposalQueuedAction[] {
  const stamped = stampChange(request);
  const byAction = (id: string, kind: ProposalDraftFinding['kind']) =>
    findings.filter((finding) => finding.actionId === id && finding.kind === kind);
  const known = new Set(existing.map((action) => action.id));
  const clashesWithQueue = (id: string, kind: ProposalDraftFinding['kind']) =>
    byAction(id, kind).some((finding) => finding.existingIds.some((existingId) => known.has(existingId)));

  const place = (queue: ProposalQueuedAction[], actions: ProposalQueuedAction[]) =>
    request.replaces?.length ? replaceInQueue(queue, request.replaces, actions) : [...queue, ...actions];

  if (request.bundle) {
    const repeats = stamped.some(
      (action) => clashesWithQueue(action.id, 'duplicate') || clashesWithQueue(action.id, 'conflict')
    );
    if (resolution === 'skip' && repeats) return existing;
    if (resolution !== 'replace') return place(existing, stamped);
    // Take out what the bundle clashes with, then add the bundle where the change was or at the end.
    const clashing = stamped.flatMap((action) =>
      [...byAction(action.id, 'conflict'), ...byAction(action.id, 'duplicate')].flatMap((f) => f.existingIds)
    );
    const removed = expandToBundles(
      existing,
      clashing.filter((id) => known.has(id))
    );
    return place(
      existing.filter((action) => !removed.has(action.id)),
      stamped
    );
  }

  let queue = request.replaces?.length ? replaceInQueue(existing, request.replaces, []) : [...existing];
  const insertAt = request.replaces?.length
    ? existing.findIndex((action) => expandToBundles(existing, request.replaces!).has(action.id))
    : -1;
  const added: ProposalQueuedAction[] = [];
  for (const action of stamped) {
    if (clashesWithQueue(action.id, 'duplicate')) continue;
    const conflicts = byAction(action.id, 'conflict').flatMap((finding) => finding.existingIds);
    const queuedConflicts = conflicts.filter((id) => queue.some((candidate) => candidate.id === id));
    if (queuedConflicts.length && resolution === 'skip') continue;
    if (queuedConflicts.length && resolution === 'replace') {
      queue = replaceStep(queue, queuedConflicts, action);
      continue;
    }
    added.push(action);
  }
  if (insertAt >= 0) {
    const at = Math.min(insertAt, queue.length);
    return [...queue.slice(0, at), ...added, ...queue.slice(at)];
  }
  return [...queue, ...added];
}
