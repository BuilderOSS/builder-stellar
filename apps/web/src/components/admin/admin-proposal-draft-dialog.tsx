'use client';

import { Stack } from 'styled-system/jsx';

import { Badge, Button, Card, Heading, Text } from '@/components/ui';
import { getProposalActionLabel } from '@/lib/proposal-call';
import type { PendingAdminProposal } from '@/lib/use-admin-proposal-draft';

export function AdminProposalDraftDialog({
  pending,
  onCancel,
  onResolve
}: {
  pending: PendingAdminProposal | null;
  onCancel: () => void;
  onResolve: (resolution: 'add' | 'replace' | 'keep') => void;
}) {
  if (!pending) return null;
  const duplicate = pending.findings.some((finding) => finding.kind === 'duplicate');
  const conflict = pending.findings.some((finding) => finding.kind === 'conflict');
  const highRisk = pending.findings.some((finding) => finding.kind === 'high-risk');

  return (
    <div className="proposal-consent-backdrop" role="presentation" onClick={onCancel}>
      <Card
        className="proposal-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-consent-title"
        onClick={(event) => event.stopPropagation()}
        p="5"
      >
        <Stack gap="4">
          <div>
            <Badge>{getProposalActionLabel(pending.action.type)}</Badge>
            <Heading id="proposal-consent-title" style={{ marginTop: '10px', fontSize: '1.35rem' }}>
              Review before adding to draft
            </Heading>
          </div>
          <Card p="3" style={{ background: 'var(--gray-2)' }}>
            <Text style={{ fontWeight: 600 }}>{pending.summary}</Text>
            <Text style={{ marginTop: '6px', fontSize: '0.875rem', color: 'var(--gray-11)' }}>
              This only updates your local proposal draft. Your wallet will not be asked to sign yet.
            </Text>
          </Card>
          {pending.findings.map((finding, index) => (
            <Card
              key={`${finding.kind}-${index}`}
              p="3"
              style={{ borderColor: finding.severity === 'error' ? 'var(--red-7)' : 'var(--amber-7)' }}
            >
              <Text style={{ fontWeight: 600 }}>
                {finding.kind === 'high-risk' ? 'High-risk action' : finding.kind}
              </Text>
              <Text style={{ marginTop: '4px', fontSize: '0.875rem' }}>{finding.message}</Text>
            </Card>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {conflict ? (
              <Button type="button" onClick={() => onResolve('replace')}>
                Replace existing action
              </Button>
            ) : null}
            {!duplicate && !conflict ? (
              <Button type="button" onClick={() => onResolve(highRisk ? 'keep' : 'add')}>
                Add to draft
              </Button>
            ) : null}
            {duplicate && !conflict ? (
              <Text style={{ alignSelf: 'center', fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                Nothing added. Remove the existing duplicate from the draft if needed.
              </Text>
            ) : null}
          </div>
        </Stack>
      </Card>
    </div>
  );
}
