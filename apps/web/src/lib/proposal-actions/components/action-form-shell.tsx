// src/lib/proposal-actions/components/action-form-shell.tsx

'use client';

import type { ReactNode } from 'react';
import { Stack } from 'styled-system/jsx';

import { Badge, Button, Callout, Card, FieldLabel, Select, Text } from '@/components/ui';

import { getAllActionHandlers } from '../registry';
import type { PreconditionResult, ProposalActionType } from '../types';

export interface ActionFormShellProps {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  actionLabel: string;
  disabled: boolean;
  preconditionResult?: PreconditionResult;
  onActionTypeChange: (type: ProposalActionType) => void;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
}

export function ActionFormShell({
  mode,
  actionType,
  actionLabel: _actionLabel,
  disabled,
  preconditionResult,
  onActionTypeChange,
  onSave,
  onCancel,
  children
}: ActionFormShellProps) {
  const allHandlers = getAllActionHandlers();

  return (
    <Card p="5">
      <Stack gap="3">
        {/* Precondition blocking message */}
        {preconditionResult && !preconditionResult.canExecute && (
          <Callout variant={preconditionResult.loading ? 'info' : 'error'} title={preconditionResult.reason} />
        )}

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'flex-start'
          }}
        >
          <Stack gap="1">
            <Badge>{mode === 'edit' ? 'Editing' : 'Action builder'}</Badge>
            <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>
              {mode === 'edit' ? 'Edit queued action' : 'Add action'}
            </Text>
          </Stack>
          {mode === 'edit' && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
              Cancel edit
            </Button>
          )}
        </div>

        {/* Action Type Selector */}
        <Stack gap="2">
          <FieldLabel htmlFor="proposal-action-type">Action type</FieldLabel>
          <Select
            id="proposal-action-type"
            value={actionType}
            onChange={(event) => onActionTypeChange(event.target.value as ProposalActionType)}
            disabled={disabled}
            aria-label="Action type"
          >
            {allHandlers.map((handler) => (
              <option key={handler.type} value={handler.type}>
                {handler.label}
              </option>
            ))}
          </Select>
          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
            Each queued action becomes a separate governor call in the final proposal.
          </Text>
        </Stack>

        {/* Form Content (children) */}
        {children}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
            Clear draft
          </Button>
          <Button type="button" onClick={onSave} disabled={disabled}>
            {mode === 'edit' ? 'Save action' : 'Add action'}
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
