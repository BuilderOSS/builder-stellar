import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionLabel, getProposalActionSummary } from '@/lib/proposal-call';
import {
  PROPOSAL_DESCRIPTION_MAX_BYTES,
  proposalDescriptionBytes,
  type ProposalMetadataDraft
} from '@/lib/proposal-metadata';

import { queueItems } from './queue';

export const WHAT_THIS_DOES_HEADING = '## What this does';
const SHORT_TITLE = 80;

/** A bundle's name without its step count: "Change the auction: 3 steps" → "Change the auction". */
function bundleName(label: string | undefined) {
  return String(label ?? '').replace(/:\s*\d+\s+steps?$/, '');
}

/** One line per queue row: the producer's note, or the action's own summary when it left none. */
export function actionLines(actions: ProposalQueuedAction[]) {
  return queueItems(actions).map((item) => {
    const first = item.actions[0];
    const note = item.actions.map((action) => String(action.note ?? '').trim()).find(Boolean);
    if (item.bundleId) {
      const name = bundleName(item.bundleLabel) || getProposalActionLabel(first.type);
      return note && note !== name ? `${name}. ${note}` : `${name}.`;
    }
    return note || `${getProposalActionSummary(first)}.`;
  });
}

/** A title made from the actions, for the member to edit: "Change the quorum to 10% and 2 more actions". */
export function suggestTitle(actions: ProposalQueuedAction[]) {
  const items = queueItems(actions);
  if (!items.length) return '';
  const first = items[0];
  const summary = first.bundleId ? bundleName(first.bundleLabel) : getProposalActionSummary(first.actions[0]);
  const lead = summary.length <= SHORT_TITLE ? summary : getProposalActionLabel(first.actions[0].type);
  // Every step counts, a bundle's too, as the composer's "N actions" does.
  const rest = actions.length - first.actions.length;
  return rest ? `${lead} and ${rest} more ${rest === 1 ? 'action' : 'actions'}` : lead;
}

/**
 * The "What this does" section, as many lines as fit in the description's byte budget alongside what
 * the member already wrote. Lines that don't fit are counted instead of cut mid-sentence.
 */
export function whatThisDoes(actions: ProposalQueuedAction[], metadata: ProposalMetadataDraft) {
  const lines = actionLines(actions);
  if (!lines.length) return '';
  // Steps per line, so lines left out are counted the way the composer counts actions.
  const steps = queueItems(actions).map((item) => item.actions.length);
  const base = stripWhatThisDoes(metadata.description);
  const build = (shown: string[], hidden: number) =>
    [
      WHAT_THIS_DOES_HEADING,
      '',
      ...shown.map((line) => `- ${line}`),
      ...(hidden ? [`- And ${hidden} more ${hidden === 1 ? 'action' : 'actions'}, listed with the proposal.`] : [])
    ].join('\n');
  for (let shown = lines.length; shown >= 0; shown -= 1) {
    const hidden = steps.slice(shown).reduce((sum, count) => sum + count, 0);
    const section = build(lines.slice(0, shown), hidden);
    const description = withSection(base, section);
    if (proposalDescriptionBytes({ ...metadata, description }) <= PROPOSAL_DESCRIPTION_MAX_BYTES) return section;
  }
  return '';
}

/** The description without an earlier "What this does" section, so it can be written again. */
export function stripWhatThisDoes(description: string) {
  const start = description.indexOf(WHAT_THIS_DOES_HEADING);
  if (start < 0) return description.trimEnd();
  const after = description.slice(start + WHAT_THIS_DOES_HEADING.length);
  const next = after.search(/\n#{1,2} /);
  const tail = next < 0 ? '' : after.slice(next + 1);
  return [description.slice(0, start).trimEnd(), tail.trim()].filter(Boolean).join('\n\n');
}

function withSection(base: string, section: string) {
  return [base.trim(), section].filter(Boolean).join('\n\n');
}

/** The description with a fresh "What this does" section in place of any earlier one. */
export function applyWhatThisDoes(actions: ProposalQueuedAction[], metadata: ProposalMetadataDraft) {
  return withSection(stripWhatThisDoes(metadata.description), whatThisDoes(actions, metadata));
}
