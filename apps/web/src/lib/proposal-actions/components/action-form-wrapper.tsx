// src/lib/proposal-actions/components/action-form-wrapper.tsx

'use client';

import { Suspense, useCallback, useState } from 'react';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Skeleton } from '@/components/ui';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import {
  normalizeWalletAddress,
  selectValidationErrors,
  useProposalComposerStore
} from '@/stores/proposal-composer-store';

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
export function ActionFormWrapper({ daoId }: { daoId: string }) {
  const context = useActionFormContext();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const address = useDaoSessionStore((state) => state.address);
  const walletKey = normalizeWalletAddress(address);

  // Subscribe to only what we need (performance optimization)
  const editingState = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.editingState ?? null);
  const validationErrors = useProposalComposerStore(selectValidationErrors(address || null, daoId));
  const busy = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.busy ?? false);

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
      setValidationErrors(address, daoId, validation);
      return;
    }

    const action = handler.serialize(editingState.draftData, context);
    saveAction(address, daoId, action);
    setValidationErrors(address, daoId, null);
  }, [address, daoId, editingState, context, saveAction, setValidationErrors]);

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
            changeActionType(address, daoId, newType);
            setValidationErrors(address, daoId, null);
            setConfirmDialog(null);
          }
        });
        return;
      }

      changeActionType(address, daoId, newType);
      setValidationErrors(address, daoId, null);
    },
    [address, daoId, editingState, changeActionType, setValidationErrors]
  );

  const handleCancel = useCallback(() => {
    cancelEdit(address, daoId);
    setValidationErrors(address, daoId, null);
  }, [address, daoId, cancelEdit, setValidationErrors]);

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
          <Suspense
            fallback={
              <div role="status" aria-busy="true" className="skeleton-form">
                <span className="sr-only">Loading action form</span>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <Skeleton style={{ width: '100px', height: '0.9em' }} />
                  <Skeleton style={{ width: '100%', height: '2.5em' }} />
                  <Skeleton style={{ width: '180px', height: '0.9em' }} />
                  <Skeleton style={{ width: '100%', height: '2.5em' }} />
                </div>
              </div>
            }
          >
            <FormComponent
              value={editingState.draftData}
              onChange={(value) => updateDraft(address, daoId, value)}
              disabled={isDisabled}
              validationErrors={validationErrors || undefined}
              network={context.config.name}
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
