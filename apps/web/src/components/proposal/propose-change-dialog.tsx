'use client';

import { css } from 'styled-system/css';

import { Button, Callout, Chip, Dialog } from '@/components/ui';
import { getProposalActionLabel } from '@/lib/proposal-call';
import type { ChangeFinding } from '@/lib/proposal-changes/review';
import { useResolvePendingChange } from '@/lib/proposal-changes/use-propose-change';
import { usePendingChangeStore } from '@/stores/pending-change-store';

const summaryBox = css({ display: 'grid', gap: '1.5', p: '3.5', borderRadius: 'control', bg: 'raised' });
const summaryText = css({ textStyle: 'body', fontWeight: '600', color: 'ink', m: '0' });
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const FINDING_TITLE = {
  'high-risk': 'High-risk change',
  duplicate: 'Already in your proposal',
  conflict: 'Changes the same thing as another change',
  order: 'Check the order'
} as const;

/** The same warning for several steps (e.g. three upgrades) reads once, with a count. */
function groupFindings(findings: ChangeFinding[]) {
  const groups = new Map<string, { finding: ChangeFinding; count: number }>();
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.severity}:${finding.message}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { finding, count: 1 });
  }
  return [...groups.values()];
}

/**
 * The one review for a change that repeats, clashes or is high-risk, wherever it was made. Mounted once in
 * the tribe layout and driven by the pending-change store. Nothing is signed here.
 */
export function ProposeChangeDialog() {
  const pending = usePendingChangeStore((state) => state.pending);
  const resolve = useResolvePendingChange();
  const findings = pending?.findings ?? [];
  const actions = pending?.request.actions ?? [];
  const incoming = new Set(actions.map((action) => action.id));
  // Only what clashes with the proposal so far asks a question; a plan's own steps were ordered by its page.
  const queued = (finding: ChangeFinding) => finding.existingIds.some((id) => !incoming.has(id));
  const duplicate = findings.some((finding) => finding.kind === 'duplicate' && queued(finding));
  const conflict = findings.some((finding) => finding.kind === 'conflict' && queued(finding));
  const bundle = pending?.request.bundle;
  const onlyUpgrades = actions.length > 0 && actions.every((action) => action.type === 'upgrade-dao-module');
  const repeatsOnly = duplicate && !conflict;
  const everyStepRepeats =
    repeatsOnly &&
    actions.every((action) =>
      findings.some((finding) => finding.actionId === action.id && finding.kind === 'duplicate' && queued(finding))
    );

  return (
    <Dialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) resolve('cancel');
      }}
      title={conflict ? 'Replace the change already in your proposal?' : 'Add this to your proposal?'}
      description="It joins your proposal on this browser. Your wallet isn't asked to sign anything yet."
      footer={
        pending ? (
          <>
            <Button variant="ghost" onClick={() => resolve('cancel')}>
              Cancel
            </Button>
            {conflict ? (
              <>
                <Button variant="secondary" onClick={() => resolve('keep')}>
                  Keep both
                </Button>
                <Button onClick={() => resolve('replace')}>Replace it</Button>
              </>
            ) : repeatsOnly ? (
              everyStepRepeats ? null : (
                <Button onClick={() => resolve('skip')}>Add the new ones</Button>
              )
            ) : (
              <Button onClick={() => resolve('add')}>Add to proposal</Button>
            )}
          </>
        ) : null
      }
    >
      {pending ? (
        <>
          <div>
            <Chip tone="outline">
              {bundle
                ? bundle.label
                : actions.length > 1
                  ? `${actions.length} changes`
                  : getProposalActionLabel(actions[0].type)}
            </Chip>
          </div>
          <div className={summaryBox}>
            {pending.summaries.map((summary, index) => (
              <p key={`${index}-${summary}`} className={summaryText}>
                {summary}
              </p>
            ))}
          </div>
          {groupFindings(findings).map(({ finding, count }, index) => {
            // Manage only offers approved upgrades, so they read as information rather than a warning.
            const routineUpgrade = finding.kind === 'high-risk' && onlyUpgrades;
            const title = routineUpgrade ? 'Contract upgrade' : FINDING_TITLE[finding.kind];
            return (
              <Callout
                key={`${finding.kind}-${index}`}
                variant={finding.severity === 'error' ? 'error' : routineUpgrade ? 'info' : 'warning'}
                title={count > 1 ? `${title} (${count} steps)` : title}
                description={finding.message}
              />
            );
          })}
          {everyStepRepeats ? (
            <p className={note}>It&apos;s already in your proposal, so there is nothing new to add.</p>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}
