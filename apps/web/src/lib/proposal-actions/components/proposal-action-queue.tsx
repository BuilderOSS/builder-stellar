// src/lib/proposal-actions/components/proposal-action-queue.tsx

'use client';

import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Badge, Button, Card, Text } from '@/components/ui';
import { useProposalComposerStore } from '@/stores/proposal-composer-store';

import { getActionHandler } from '../registry';

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

export function ProposalActionQueue() {
  const queuedActions = useProposalComposerStore((s) => s.queuedActions);
  const editingState = useProposalComposerStore((s) => s.editingState);
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
          beginEdit(index);
          setConfirmDialog(null);
        }
      });
      return;
    }
    beginEdit(index);
  };

  const handleRemove = (index: number, actionLabel: string) => {
    setConfirmDialog({
      open: true,
      title: 'Remove action?',
      message: `Are you sure you want to remove this ${actionLabel} action?`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        removeAction(index);
        setConfirmDialog(null);
      }
    });
  };

  if (queuedActions.length === 0) {
    return (
      <Card p="4">
        <Text style={{ color: 'var(--gray-11)' }}>No actions queued yet. Add an action above to get started.</Text>
      </Card>
    );
  }

  return (
    <Stack gap="3">
      {queuedActions.map((action, index) => {
        const handler = getActionHandler(action.type);
        const isEditing = editingIndex === index;

        return (
          <Card
            key={action.id}
            p="4"
            style={{
              border: isEditing ? '2px solid var(--accent-9)' : undefined
            }}
          >
            <Stack gap="3">
              <div>
                {isEditing && <Badge style={{ marginBottom: '8px' }}>Currently editing</Badge>}
                <Text style={{ fontWeight: 600, marginBottom: '4px' }}>{handler.label}</Text>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                  To: {action.recipient}
                  {action.amount && ` • Amount: ${action.amount}`}
                  {action.assetCode && ` ${action.assetCode}`}
                </Text>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(index)}
                  disabled={isEditing}
                >
                  {isEditing ? 'Editing' : 'Edit'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemove(index, handler.label)}
                  disabled={isEditing}
                >
                  Remove
                </Button>
              </div>
            </Stack>
          </Card>
        );
      })}
      <ProposalActionConfirmDialog
        open={confirmDialog?.open ?? false}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel ?? 'Confirm'}
        busy={false}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </Stack>
  );
}
