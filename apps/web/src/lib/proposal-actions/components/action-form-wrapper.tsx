// src/lib/proposal-actions/components/action-form-wrapper.tsx

'use client';

import { Suspense, useCallback, useContext } from 'react';
import { css } from 'styled-system/css';

import { SettingValuesContext } from '@/components/proposal-changes/setting-forms';
import { Callout, Skeleton } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { daoRoute } from '@/lib/dao-routes';
import { ACTION_CATALOG, actionHome, getActionMeta } from '@/lib/proposal-changes/catalog';
import { composerChange } from '@/lib/proposal-changes/composer-change';
import { useProposeChange } from '@/lib/proposal-changes/use-propose-change';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import {
  normalizeWalletAddress,
  selectValidationErrors,
  useProposalComposerStore
} from '@/stores/proposal-composer-store';

import { useActionFormContext } from '../context';
import { getActionHandler } from '../registry';
import { ActionErrorBoundary } from './action-error-boundary';
import { ActionFormShell } from './action-form-shell';

const EMPTY: never[] = [];

/**
 * The change being set up in the composer, from the store. It uses the setting's own form (the one its
 * Manage page shows), starts from the live value, and saves through the same pipeline as every page.
 */
export function ActionFormWrapper({ daoId, onDone }: { daoId: string; onDone?: () => void }) {
  const { routeId } = useDaoContext();
  const context = useActionFormContext();
  const values = useContext(SettingValuesContext);
  const { propose } = useProposeChange();
  const address = useAuthSessionStore((state) => state.address);
  const walletKey = normalizeWalletAddress(address);

  const editingState = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.editingState ?? null);
  const queuedActions = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.queuedActions ?? EMPTY);
  const validationErrors = useProposalComposerStore(selectValidationErrors(address || null, daoId));
  const busy = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.busy ?? false);
  const formMessage = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.formMessage ?? '');

  const updateDraft = useProposalComposerStore((s) => s.updateDraft);
  const cancelEdit = useProposalComposerStore((s) => s.cancelEdit);
  const setValidationErrors = useProposalComposerStore((s) => s.setValidationErrors);
  const setFormMessage = useProposalComposerStore((s) => s.setFormMessage);

  // A single mint saved before minting had one form opens in that form.
  const formActionType =
    editingState?.actionType === 'mint-governance-token' ? 'batch-mint-governance-token' : editingState?.actionType;
  const handler = formActionType ? getActionHandler(formActionType) : null;
  const preconditionResult = handler?.checkPreconditions?.(context) ?? { canExecute: true };

  const handleSave = useCallback(() => {
    if (!editingState || !handler) return;
    const validation = handler.validate(editingState.draftData, context);
    if (!validation.valid) {
      setValidationErrors(address, daoId, validation);
      return;
    }
    setValidationErrors(address, daoId, null);
    const action = handler.serialize(editingState.draftData, context);
    const editingId =
      editingState.mode === 'edit' && editingState.index !== undefined
        ? queuedActions[editingState.index]?.id
        : undefined;
    const result = propose(
      composerChange(action, queuedActions, { editingId, auctionPaused: values.auction?.paused }),
      {
        onAdded: () => {
          cancelEdit(address, daoId);
          onDone?.();
        }
      }
    );
    if (result.outcome === 'invalid') setFormMessage(address, daoId, result.message);
    if (result.outcome === 'no-wallet') setFormMessage(address, daoId, 'Connect a wallet to add changes.');
  }, [
    address,
    daoId,
    editingState,
    handler,
    context,
    queuedActions,
    values,
    propose,
    cancelEdit,
    onDone,
    setValidationErrors,
    setFormMessage
  ]);

  const handleBack = useCallback(() => {
    cancelEdit(address, daoId);
    setValidationErrors(address, daoId, null);
  }, [address, daoId, cancelEdit, setValidationErrors]);
  const handleCancel = useCallback(() => {
    handleBack();
    onDone?.();
  }, [handleBack, onDone]);

  if (!editingState || !handler) return null;
  const formType = formActionType!;

  const FormComponent = ACTION_CATALOG[formType].Form ?? handler.FormComponent;
  const meta = getActionMeta(formType);
  const current = meta.currentValue?.(values);
  const home = actionHome(formType);
  const isDisabled = busy || !preconditionResult.canExecute;

  return (
    <ActionFormShell
      mode={editingState.mode}
      actionLabel={handler.label}
      description={handler.description}
      now={current?.text}
      home={home.surface === 'composer' ? undefined : { label: home.label, href: daoRoute(routeId, home.href) }}
      disabled={isDisabled}
      preconditionResult={preconditionResult}
      onBack={handleBack}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      <ActionErrorBoundary actionType={formType}>
        <Suspense
          fallback={
            <div role="status" aria-busy="true" className={css({ display: 'grid', gap: '2.5' })}>
              <span className="sr-only">Loading the form</span>
              <Skeleton className={css({ width: '24', height: '3.5' })} />
              <Skeleton className={css({ height: '11' })} />
            </div>
          }
        >
          <FormComponent
            value={editingState.draftData}
            onChange={(value: unknown) => updateDraft(address, daoId, value)}
            disabled={isDisabled}
            validationErrors={validationErrors || undefined}
            network={context.config.name}
          />
        </Suspense>
      </ActionErrorBoundary>
      {formMessage && formMessage !== 'Action added' && formMessage !== 'Action updated' ? (
        <Callout variant="warning" title={formMessage} />
      ) : null}
    </ActionFormShell>
  );
}
