import { validateProposalActionCount } from '@/lib/governance-limits';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { type ProposalMetadataDraft, validateProposalMetadataDraft } from '@/lib/proposal-metadata';

export type ReviewGap = 'title' | 'why' | 'change';

export type ReviewReadiness = {
  ready: boolean;
  /** What is still empty, in the order the page asks for it. */
  missing: ReviewGap[];
  /** A problem with what is filled in (too long, a bad link, too many actions), when nothing is missing. */
  problem: string | null;
};

/**
 * Whether a draft can go to Review. The why and the actions can be written in either order; Review
 * needs a title, a why and at least one action.
 */
export function reviewReadiness(metadata: ProposalMetadataDraft, actions: ProposalQueuedAction[]): ReviewReadiness {
  const missing: ReviewGap[] = [];
  if (!metadata.title.trim()) missing.push('title');
  if (!metadata.description.trim()) missing.push('why');
  if (!actions.length) missing.push('change');
  if (missing.length) return { ready: false, missing, problem: null };

  const countError = validateProposalActionCount(actions.length);
  if (countError) return { ready: false, missing, problem: countError };
  const metadataValidation = validateProposalMetadataDraft(metadata);
  if (!metadataValidation.valid) return { ready: false, missing, problem: metadataValidation.message };
  return { ready: true, missing, problem: null };
}

const GAP_TEXT: Record<ReviewGap, string> = { title: 'a title', why: 'why', change: 'at least one change' };

/** "Add a title, why and at least one change to review." */
export function reviewGapText({ missing, problem }: ReviewReadiness) {
  if (problem) return problem;
  if (!missing.length) return '';
  const parts = missing.map((gap) => GAP_TEXT[gap]);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Add ${list} to review.`;
}
