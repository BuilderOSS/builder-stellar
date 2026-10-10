'use client';

import { useRef } from 'react';

import { Button, Dialog } from '@/components/ui';
import { toaster } from '@/lib/toaster';

/**
 * The one confirm for throwing a draft away, used wherever drafts appear. "Keep draft" takes focus,
 * so pressing Enter by reflex never deletes anything.
 */
export function DiscardDraftDialog({
  open,
  title,
  onCancel,
  onDiscard
}: {
  open: boolean;
  /** The draft's own name, quoted in the message. */
  title: string;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      role="alertdialog"
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      initialFocusEl={() => keep.current}
      title="Discard this draft?"
      description={`“${title}” and everything in it is removed from this browser. This can't be undone.`}
      footer={
        <>
          <Button ref={keep} variant="ghost" onClick={onCancel}>
            Keep draft
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onDiscard();
              toaster.create({ title: 'Draft discarded', type: 'info', duration: 3000 });
            }}
          >
            Discard draft
          </Button>
        </>
      }
    />
  );
}
