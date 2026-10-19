import {
  analyzeProposalAction,
  analyzeProposalDraft,
  type ProposalDraftFinding,
  type ProposalDraftState
} from '@/lib/proposal-action-identity';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';

import { type ChangeRequest, stampChange, withoutChangeMeta } from './change-request';
import { expandToBundles, replaceInQueue } from './queue';

/** A finding about one new action, naming the queued actions it is about by id (indices move). */
export type ChangeFinding = ProposalDraftFinding & { actionId: string; existingIds: string[] };

/** What the member chooses when a change repeats or clashes with one already in the proposal. */
export type ChangeResolution = 'add' | 'replace' | 'keep' | 'skip';

const REVIEW_KINDS = new Set<ProposalDraftFinding['kind']>(['duplicate', 'conflict', 'high-risk']);

/** Findings for one action against the ones before it. Where a change came from never makes it different. */
export function analyzeAgainst(
  action: ProposalQueuedAction,
  before: ProposalQueuedAction[],
  state?: ProposalDraftState
) {
  return analyzeProposalAction(withoutChangeMeta(action), before.map(withoutChangeMeta), state);
}

/** Every finding for the whole draft, as the contracts will see it when the proposal runs. */
export function analyzeDraft(actions: ProposalQueuedAction[], state?: ProposalDraftState) {
  return analyzeProposalDraft(actions.map(withoutChangeMeta), state);
}

/**
 * Every queued action's findings, keyed by action id: each against the actions before it, plus the
 * whole-draft rules (an authorize left last), on the action they name.
 */
export function analyzeQueue(actions: ProposalQueuedAction[], state?: ProposalDraftState) {
  const byAction = new Map(
    actions.map((action, index) => [action.id, analyzeAgainst(action, actions.slice(0, index), state)])
  );
  const perAction = [...byAction.values()].reduce((total, findings) => total + findings.length, 0);
  for (const finding of analyzeDraft(actions, state).slice(perAction)) {
    const id = actions[finding.existingActionIndexes[0] ?? actions.length - 1]?.id;
    if (id) byAction.get(id)!.push(finding);
  }
  return byAction;
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
export function reviewChange(request: ChangeRequest, existing: ProposalQueuedAction[], state?: ProposalDraftState) {
  const base = request.replaces?.length ? replaceInQueue(existing, request.replaces, []) : existing;
  // The draft as it would be with every new step in its real place, analyzed the way it will run.
  const projected = resolveChange(request, existing, [], 'keep');
  const incoming = new Set(request.actions.map((action) => action.id));
  const findings: ChangeFinding[] = [];
  for (const [actionId, found] of analyzeQueue(projected, state))
    if (incoming.has(actionId))
      for (const finding of found)
        findings.push({
          ...finding,
          actionId,
          existingIds: finding.existingActionIndexes.map((index) => projected[index]?.id).filter(Boolean) as string[]
        });
  // Findings against the queue already there ask the member; within a bundle, the producer already ordered it.
  // A step the proposal already had (an edited bundle keeps its other steps) was reviewed when it was added.
  const existingIds = new Set(base.map((action) => action.id));
  const alreadyQueued = new Set(existing.map((action) => action.id));
  // An edit rebuilt on its page has new ids; its high-risk steps were reviewed when the change was first added.
  const replaced = request.replaces?.length ? expandToBundles(existing, request.replaces) : new Set<string>();
  const reviewedKinds = new Set<string>(
    existing.filter((action) => replaced.has(action.id)).map((action) => action.type)
  );
  const needsReview = findings.some(
    (finding) =>
      REVIEW_KINDS.has(finding.kind) &&
      (finding.kind === 'high-risk'
        ? !alreadyQueued.has(finding.actionId) &&
          !reviewedKinds.has(request.actions.find((action) => action.id === finding.actionId)?.type ?? '')
        : finding.existingIds.some((id) => existingIds.has(id)))
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
