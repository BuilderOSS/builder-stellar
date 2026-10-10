// src/lib/proposal-actions/components/action-form-shell.tsx

'use client';

import type { ReactNode } from 'react';
import { css } from 'styled-system/css';

import { Button, Callout, Field, FieldHelperText, FieldLabel, Select, Skeleton } from '@/components/ui';

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

const shell = css({
  display: 'grid',
  gap: '4',
  p: '5',
  borderRadius: 'card',
  bg: 'surface',
  boxShadow: 'inset 0 0 0 1px token(colors.signal.edge)'
});
const head = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3' });
const title = css({ textStyle: 'heading', fontSize: '1.0625rem', m: '0' });
const footer = css({ display: 'flex', justifyContent: 'space-between', gap: '2', pt: '1' });

export function ActionFormShell({
  mode,
  actionType,
  disabled,
  preconditionResult,
  onActionTypeChange,
  onSave,
  onCancel,
  children
}: ActionFormShellProps) {
  const allHandlers = getAllActionHandlers();

  return (
    <section className={shell} aria-label={mode === 'edit' ? 'Edit action' : 'New action'}>
      {preconditionResult && !preconditionResult.canExecute && preconditionResult.loading ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Checking what this action needs</span>
          <Skeleton className={css({ width: '56', height: '4' })} />
        </div>
      ) : null}
      {preconditionResult && !preconditionResult.canExecute && !preconditionResult.loading ? (
        <Callout variant="error" title={preconditionResult.reason} />
      ) : null}

      <div className={head}>
        <h3 className={title}>{mode === 'edit' ? 'Edit action' : 'New action'}</h3>
        {mode === 'edit' ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
            Cancel edit
          </Button>
        ) : null}
      </div>

      <Field>
        <FieldLabel htmlFor="proposal-action-type">What should happen?</FieldLabel>
        <Select
          id="proposal-action-type"
          value={actionType}
          onChange={(event) => onActionTypeChange(event.target.value as ProposalActionType)}
          disabled={disabled}
        >
          {allHandlers.map((handler) => (
            <option key={handler.type} value={handler.type}>
              {handler.label}
            </option>
          ))}
        </Select>
        <FieldHelperText>Each action becomes one step that runs if the vote passes.</FieldHelperText>
      </Field>

      {children}

      <div className={footer}>
        <Button variant="ghost" onClick={onCancel} disabled={disabled}>
          Discard
        </Button>
        <Button onClick={onSave} disabled={disabled}>
          {mode === 'edit' ? 'Save action' : 'Add to proposal'}
        </Button>
      </div>
    </section>
  );
}
