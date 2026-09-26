'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { Badge, Text } from '@/components/ui';
import { getProposalActionLabel, getProposalActionSummary } from '@/lib/proposal-call';
import type { ProposalQueuedAction } from '@/stores/proposal-composer-store';

interface AdminDraftActionPreviewProps {
  action: ProposalQueuedAction;
  compact?: boolean;
  onRemove?: () => void;
  onViewDraft?: () => void;
}

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
    <div
      style={{
        backgroundColor: '#f3f4f6',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: compact ? '8px 12px' : '12px 16px',
        marginBottom: '8px'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          cursor: compact ? 'pointer' : 'default'
        }}
        onClick={() => compact && setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: '0.75rem',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              flexShrink: 0
            }}
          >
            📝 In Draft
          </Text>
          {compact && (
            <Text
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={summary}
            >
              {summary}
            </Text>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          {onViewDraft && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDraft();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
            >
              View →
            </button>
          )}
          {compact && (expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
        </div>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid #d1d5db'
          }}
        >
          <Stack gap="2">
            <Badge style={{ width: 'fit-content', fontSize: '0.75rem' }}>
              {label}
            </Badge>
            <Text
              style={{
                fontSize: '0.875rem',
                color: '#374151',
                margin: 0,
                lineHeight: '1.5'
              }}
            >
              {summary}
            </Text>
            {(onRemove || onViewDraft) && (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid #d1d5db'
                }}
              >
                {onRemove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0
                    }}
                  >
                    Remove
                  </button>
                )}
                {onViewDraft && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDraft();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3b82f6',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                      marginLeft: 'auto'
                    }}
                  >
                    View draft →
                  </button>
                )}
              </div>
            )}
          </Stack>
        </div>
      )}
    </div>
  );
}
