'use client';

import { Button, Dialog } from '@/components/ui';

type ProposalActionConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Destructive confirmations (remove, clear) use the danger style. */
  tone?: 'primary' | 'danger';
};

/** Review-before-signing confirmation, used across the proposal composer. */
export function ProposalActionConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  tone = 'primary'
}: ProposalActionConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      role="alertdialog"
      closeOnInteractOutside={!busy}
      title={title}
      description={message}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Not yet
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
