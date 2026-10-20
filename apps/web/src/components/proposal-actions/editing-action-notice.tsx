'use client';

import { Button, Callout } from '@/components/ui';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';

/** Shown on a page opened from a queued action's Edit: what is being edited, and how to stop. */
export function EditingActionNotice({
  editing,
  bundle,
  onCancel
}: {
  editing: ProposalQueuedAction | null;
  bundle?: ProposalQueuedAction[];
  onCancel: () => void;
}) {
  if (!editing) return null;
  const what =
    editing.bundleLabel && bundle && bundle.length > 1
      ? String(editing.bundleLabel)
      : getProposalActionSummary(editing);
  return (
    <Callout
      variant="info"
      title="Editing a change in your proposal"
      description={`${what.replace(/\.$/, '')}. Saving puts it back in the same place.`}
    >
      <div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Stop editing
        </Button>
      </div>
    </Callout>
  );
}
