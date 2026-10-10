'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { Button, Chip } from '@/components/ui';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionLabel, getProposalActionSummary } from '@/lib/proposal-call';

interface AdminDraftActionPreviewProps {
  action: ProposalQueuedAction;
  compact?: boolean;
  onRemove?: () => void;
  onViewDraft?: () => void;
}

const box = css({ display: 'grid', gap: '2', p: '3', mb: '2', borderRadius: 'control', bg: 'signal.wash' });
const head = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2',
  width: '100%',
  p: '0',
  bg: 'transparent',
  border: '0',
  color: 'ink',
  textAlign: 'left',
  cursor: 'pointer',
  _disabled: { cursor: 'default' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px', borderRadius: 'sm' }
});
const summaryLine = css({
  flex: '1',
  minW: '0',
  textStyle: 'caption',
  fontSize: '0.875rem',
  color: 'ink.muted',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});
const chevron = css({
  width: '4',
  height: '4',
  color: 'ink.muted',
  flexShrink: '0',
  transitionProperty: 'rotate',
  transitionDuration: 'pop',
  '&[data-open]': { rotate: '180deg' }
});
const detail = css({ display: 'grid', gap: '2', pt: '2', borderTopWidth: '1px', borderColor: 'signal.edge' });
const detailText = css({ textStyle: 'body', color: 'ink', m: '0' });
const actions = css({ display: 'flex', gap: '2', flexWrap: 'wrap' });

/** A change already waiting in the proposal draft, shown next to the form that made it. */
export function AdminDraftActionPreview({
  action,
  compact = true,
  onRemove,
  onViewDraft
}: AdminDraftActionPreviewProps) {
  const [expanded, setExpanded] = useState(!compact);
  const summary = getProposalActionSummary(action);
  const label = getProposalActionLabel(action.type);

  return (
    <div className={box}>
      <button
        type="button"
        className={head}
        onClick={() => compact && setExpanded(!expanded)}
        aria-expanded={compact ? expanded : undefined}
        disabled={!compact}
      >
        <Chip tone="live">In your draft</Chip>
        {compact ? (
          <span className={summaryLine} title={summary}>
            {summary}
          </span>
        ) : null}
        {compact ? <ChevronDown aria-hidden="true" className={chevron} data-open={expanded ? '' : undefined} /> : null}
      </button>

      {expanded ? (
        <div className={detail}>
          <div>
            <Chip tone="outline">{label}</Chip>
          </div>
          <p className={detailText}>{summary}</p>
          {onRemove || onViewDraft ? (
            <div className={actions}>
              {onRemove ? (
                <Button variant="ghost" size="sm" onClick={onRemove}>
                  Remove from draft
                </Button>
              ) : null}
              {onViewDraft ? (
                <Button variant="link" size="sm" onClick={onViewDraft}>
                  Open the draft
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : onViewDraft ? (
        <div>
          <Button variant="link" size="sm" onClick={onViewDraft}>
            Open the draft
          </Button>
        </div>
      ) : null}
    </div>
  );
}
