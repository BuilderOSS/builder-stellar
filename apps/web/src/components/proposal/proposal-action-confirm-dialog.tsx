'use client';

import { Stack } from 'styled-system/jsx';

import { Button, Card, Text } from '@/components/ui';

type ProposalActionConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ProposalActionConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel
}: ProposalActionConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.72)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
        zIndex: 50
      }}
    >
      <Card
        p="5"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 560px)',
          borderColor: 'rgba(160, 194, 225, 0.24)',
          background: 'rgba(15, 23, 42, 0.96)'
        }}
      >
        <Stack gap="3">
          <Text className="label">{title}</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.95rem' }}>
            {message}
          </Text>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </Button>
          </div>
        </Stack>
      </Card>
    </div>
  );
}
