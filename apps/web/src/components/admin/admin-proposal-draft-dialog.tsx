'use client';

import { css } from 'styled-system/css';
import { Stack } from 'styled-system/jsx';

import { Badge, Button, Callout, Card, Heading, Text } from '@/components/ui';
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
  const findings = Array.isArray(pending.findings) ? pending.findings : [];
  const duplicate = findings.some((finding) => finding.kind === 'duplicate');
  const conflict = findings.some((finding) => finding.kind === 'conflict');
  const highRisk = findings.some((finding) => finding.kind === 'high-risk');

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
            <Badge>
              {pending.requests.length > 1
                ? `${pending.requests.length} actions`
                : getProposalActionLabel(pending.action.type)}
            </Badge>
            <Heading id="proposal-consent-title" size="heading" mt="2.5">
              Review before adding to draft
            </Heading>
          </div>
          <Card p="3" className={css({ bg: 'raised' })}>
            <Stack gap="1">
              {pending.summaries.map((summary) => (
                <Text key={summary} fontWeight="600">
                  {summary}
                </Text>
              ))}
            </Stack>
            <Text className={css({ marginTop: '1.5', fontSize: '0.875rem', color: 'ink.muted' })}>
              This only updates your local proposal draft. Your wallet will not be asked to sign yet.
            </Text>
          </Card>
          {findings.map((finding, index) => (
            <Callout
              key={`${finding.kind}-${index}`}
              variant={finding.severity === 'error' ? 'error' : 'warning'}
              title={finding.kind === 'high-risk' ? 'High-risk change' : finding.kind}
              description={finding.message}
            />
          ))}
          <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '2', flexWrap: 'wrap' })}>
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
            {duplicate && !conflict && pending.requests.length > 1 ? (
              <Button type="button" onClick={() => onResolve('add')}>
                Add available actions
              </Button>
            ) : null}
            {duplicate && !conflict && pending.requests.length === 1 ? (
              <Text className={css({ alignSelf: 'center', fontSize: '0.875rem', color: 'ink.muted' })}>
                Nothing added. Remove the existing duplicate from the draft if needed.
              </Text>
            ) : null}
          </div>
        </Stack>
      </Card>
    </div>
  );
}
