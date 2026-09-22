'use client';

import { useEffect, useId, useRef } from 'react';
import { Stack } from 'styled-system/jsx';

import { Button, Card, Heading, Text } from '@/components/ui';

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
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={busy ? undefined : onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.74)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: '20px',
        zIndex: 100
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        p="5"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 560px)',
          borderColor: 'var(--border-strong)',
          background: 'var(--surface-1)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.48)'
        }}
      >
        <Stack gap="4">
          <Heading id={titleId} style={{ margin: 0, fontSize: '1.4rem' }}>
            {title}
          </Heading>
          <Text id={descriptionId} className="lede" style={{ margin: 0, fontSize: '0.95rem' }}>
            {message}
          </Text>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
            <Button ref={cancelButtonRef} type="button" variant="outline" onClick={onCancel} disabled={busy}>
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
