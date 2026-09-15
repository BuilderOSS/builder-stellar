// src/lib/proposal-actions/components/action-form-wrapper.tsx

'use client';

import { Suspense, useCallback, useState } from 'react';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Text } from '@/components/ui';
import { selectValidationErrors, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { useActionFormContext } from '../context';
import { getActionHandler } from '../registry';
import type { ProposalActionType } from '../types';
import { ActionErrorBoundary } from './action-error-boundary';
import { ActionFormShell } from './action-form-shell';

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

/**
 * ActionFormWrapper consumes Zustand store directly
 * NO PROPS needed - all state comes from store
 */
export function ActionFormWrapper() {
  const context = useActionFormContext();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  // Subscribe to only what we need (performance optimization)
  const editingState = useProposalComposerStore((s) => s.editingState);
  const validationErrors = useProposalComposerStore(selectValidationErrors);
  const busy = useProposalComposerStore((s) => s.busy);

  // Actions
  const updateDraft = useProposalComposerStore((s) => s.updateDraft);
  const saveAction = useProposalComposerStore((s) => s.saveAction);
  const cancelEdit = useProposalComposerStore((s) => s.cancelEdit);
  const changeActionType = useProposalComposerStore((s) => s.changeActionType);
  const setValidationErrors = useProposalComposerStore((s) => s.setValidationErrors);

  // Check preconditions for current action
  const handler = editingState ? getActionHandler(editingState.actionType) : null;
  const preconditionResult = handler?.checkPreconditions?.(context) ?? { canExecute: true };

  const handleSave = useCallback(() => {
    if (!editingState) return;

    const handler = getActionHandler(editingState.actionType);
    const validation = handler.validate(editingState.draftData, context);

    if (!validation.valid) {
      setValidationErrors(validation);
      return;
    }

    const action = handler.serialize(editingState.draftData, context);
    saveAction(action);
    setValidationErrors(null);
  }, [editingState, context, saveAction, setValidationErrors]);

  const handleActionTypeChange = useCallback(
    (newType: ProposalActionType) => {
      if (!editingState) return;

      const handler = getActionHandler(editingState.actionType);
      const hasChanges = JSON.stringify(editingState.draftData) !== JSON.stringify(handler.getDefaultValues());

      if (hasChanges) {
        setConfirmDialog({
          open: true,
          title: 'Switch action type?',
          message: 'Switching action type will clear your current draft. Continue?',
          confirmLabel: 'Switch',
          onConfirm: () => {
            changeActionType(newType);
            setValidationErrors(null);
            setConfirmDialog(null);
          }
        });
        return;
      }

      changeActionType(newType);
      setValidationErrors(null);
    },
    [editingState, changeActionType, setValidationErrors]
  );

  const handleCancel = useCallback(() => {
    cancelEdit();
    setValidationErrors(null);
  }, [cancelEdit, setValidationErrors]);

  // No editing state - show empty state
  if (!editingState) {
    return null;
  }

  const FormComponent = handler!.FormComponent;
  const isDisabled = busy || !preconditionResult.canExecute;

  return (
    <>
      <ActionFormShell
        mode={editingState.mode}
        actionType={editingState.actionType}
        actionLabel={handler!.label}
        disabled={isDisabled}
        preconditionResult={preconditionResult}
        onActionTypeChange={handleActionTypeChange}
        onSave={handleSave}
        onCancel={handleCancel}
      >
        <ActionErrorBoundary actionType={editingState.actionType}>
          <Suspense fallback={<Text>Loading form...</Text>}>
            <FormComponent
              value={editingState.draftData}
              onChange={updateDraft}
              disabled={isDisabled}
              validationErrors={validationErrors || undefined}
            />
          </Suspense>
        </ActionErrorBoundary>
      </ActionFormShell>
      <ProposalActionConfirmDialog
        open={confirmDialog?.open ?? false}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel ?? 'Confirm'}
        busy={false}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </>
  );
}
