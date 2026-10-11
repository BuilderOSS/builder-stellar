'use client';

import { css } from 'styled-system/css';

import { Button, Callout, Chip, Dialog } from '@/components/ui';
import { getProposalActionLabel } from '@/lib/proposal-call';
import type { PendingAdminProposal } from '@/lib/use-admin-proposal-draft';

const summaryBox = css({ display: 'grid', gap: '1.5', p: '3.5', borderRadius: 'control', bg: 'raised' });
const summaryText = css({ textStyle: 'body', fontWeight: '600', color: 'ink', m: '0' });
const FINDING_TITLE = {
  'high-risk': 'High-risk change',
  duplicate: 'Already in your draft',
  conflict: 'Clashes with another change',
  order: 'Check the order'
} as const;
const note = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

/** Review a change before it joins the local proposal draft. Nothing is signed here. */
export function AdminProposalDraftDialog({
  pending,
  onCancel,
  onResolve
}: {
  pending: PendingAdminProposal | null;
  onCancel: () => void;
  onResolve: (resolution: 'add' | 'replace' | 'keep') => void;
}) {
  const findings = Array.isArray(pending?.findings) ? pending.findings : [];
  // The same warning for several changes (e.g. three upgrades) reads once, with a count.
  const shownFindings = [
    ...findings
      .reduce((groups, finding) => {
        const key = `${finding.kind}:${finding.severity}:${finding.message}`;
        const group = groups.get(key);
        if (group) group.count += 1;
        else groups.set(key, { finding, count: 1 });
        return groups;
      }, new Map<string, { finding: (typeof findings)[number]; count: number }>())
      .values()
  ];
  const duplicate = findings.some((finding) => finding.kind === 'duplicate');
  const conflict = findings.some((finding) => finding.kind === 'conflict');
  const highRisk = findings.some((finding) => finding.kind === 'high-risk');

  return (
    <Dialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Add this change to your draft?"
      description="It joins your proposal draft on this browser. Your wallet isn't asked to sign anything yet."
      footer={
        pending ? (
          <>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            {conflict ? <Button onClick={() => onResolve('replace')}>Replace the existing change</Button> : null}
            {!duplicate && !conflict ? (
              <Button onClick={() => onResolve(highRisk ? 'keep' : 'add')}>Add to draft</Button>
            ) : null}
            {duplicate && !conflict && pending.requests.length > 1 ? (
              <Button onClick={() => onResolve('add')}>Add the new ones</Button>
            ) : null}
          </>
        ) : null
      }
    >
      {pending ? (
        <>
          <div>
            <Chip tone="outline">
              {pending.requests.length > 1
                ? `${pending.requests.length} changes`
                : getProposalActionLabel(pending.action.type)}
            </Chip>
          </div>
          <div className={summaryBox}>
            {pending.summaries.map((summary) => (
              <p key={summary} className={summaryText}>
                {summary}
              </p>
            ))}
          </div>
          {shownFindings.map(({ finding, count }, index) => (
            <Callout
              key={`${finding.kind}-${index}`}
              variant={finding.severity === 'error' ? 'error' : 'warning'}
              title={count > 1 ? `${FINDING_TITLE[finding.kind]} (${count} changes)` : FINDING_TITLE[finding.kind]}
              description={finding.message}
            />
          ))}
          {duplicate && !conflict && pending.requests.length === 1 ? (
            <p className={note}>
              It&apos;s already in your draft, so nothing was added. Remove the existing one first if you meant to
              change it.
            </p>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}
