// src/lib/proposal-actions/components/proposal-action-queue.tsx

'use client';

import { useState } from 'react';
import { css } from 'styled-system/css';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Button, Chip } from '@/components/ui';
import { getProposalActionSummary } from '@/lib/proposal-call';
import { useAuthSessionStore } from '@/stores/auth-session-store';
import { normalizeWalletAddress, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { getActionHandler } from '../registry';

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

const empty = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const list = css({ display: 'grid', listStyle: 'none', m: '0', p: '0' });
const item = css({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '3',
  py: '3.5',
  borderBottomWidth: '1px',
  borderColor: 'rule',
  _last: { borderBottomWidth: '0' },
  md: { gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center' }
});
const number = css({
  display: 'grid',
  placeItems: 'center',
  width: '7',
  height: '7',
  borderRadius: 'full',
  bg: 'hover',
  textStyle: 'micro',
  color: 'ink.muted',
  '[data-editing] > &': { bg: 'signal.wash', color: 'signal' }
});
const body = css({ minW: '0' });
const label = css({ textStyle: 'body', fontWeight: '600', m: '0' });
const summary = css({ textStyle: 'caption', color: 'ink.muted', m: '0', mt: '0.5', overflowWrap: 'anywhere' });
const buttons = css({ display: 'flex', gap: '1', gridColumn: { base: '2', md: 'auto' } });

export function ProposalActionQueue({ daoId, editable = true }: { daoId: string; editable?: boolean }) {
  const address = useAuthSessionStore((state) => state.address);
  const walletKey = normalizeWalletAddress(address);
  const queuedActions = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.queuedActions ?? []);
  const editingState = useProposalComposerStore((s) => s.draftsByWallet[walletKey]?.[daoId]?.editingState ?? null);
  const editingIndex = editingState?.index;
  const beginEdit = useProposalComposerStore((s) => s.beginEdit);
  const removeAction = useProposalComposerStore((s) => s.removeAction);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  const handleEdit = (index: number) => {
    // If already editing a different action, confirm before switching
    if (editingState && editingIndex !== index) {
      setConfirmDialog({
        open: true,
        title: 'Switch to editing this action?',
        message: 'Your current unsaved changes will be discarded (the original queued action remains unchanged).',
        confirmLabel: 'Switch',
        onConfirm: () => {
          beginEdit(address, daoId, index);
          setConfirmDialog(null);
        }
      });
      return;
    }
    beginEdit(address, daoId, index);
  };

  const handleRemove = (index: number, actionLabel: string) => {
    setConfirmDialog({
      open: true,
      title: 'Remove action?',
      message: `This ${actionLabel} action comes out of the proposal.`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        removeAction(address, daoId, index);
        setConfirmDialog(null);
      }
    });
  };

  if (queuedActions.length === 0) {
    return <p className={empty}>No actions yet. Add one above.</p>;
  }

  return (
    <div>
      <ol className={list}>
        {queuedActions.map((action, index) => {
          const handler = getActionHandler(action.type);
          const isEditing = editingIndex === index;
          return (
            <li key={action.id} className={item} data-editing={isEditing ? '' : undefined}>
              <span className={number} aria-hidden="true">
                {index + 1}
              </span>
              <div className={body}>
                <p className={label}>
                  {handler.label}
                  {isEditing ? (
                    <span className={css({ ml: '2' })}>
                      <Chip tone="live">Editing</Chip>
                    </span>
                  ) : null}
                </p>
                <p className={summary}>{getProposalActionSummary(action)}</p>
              </div>
              <div className={buttons}>
                {editable ? (
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(index)} disabled={isEditing}>
                    Edit
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(index, handler.label)}
                  disabled={editable && isEditing}
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <ProposalActionConfirmDialog
        open={confirmDialog?.open ?? false}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel ?? 'Confirm'}
        tone={confirmDialog?.confirmLabel === 'Remove' ? 'danger' : 'primary'}
        busy={false}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
