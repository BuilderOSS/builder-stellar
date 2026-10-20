'use client';

import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { toaster } from '@/lib/toaster';
import { useProposalComposerStore } from '@/stores/proposal-composer-store';

import type { AddedNotice } from './propose-action';
import { actionCountText } from './queue';

/** A toast action shown beside the main one; AppToaster renders it from `meta.undo`. */
export type ToastUndo = { label: string; onClick: () => void };

const UNDO_DURATION = 8000;

function undoTo(address: string, daoId: string, previous: ProposalQueuedAction[], title: string): ToastUndo {
  return {
    label: 'Undo',
    onClick: () => {
      useProposalComposerStore.getState().restore(address, daoId, previous);
      toaster.create({ type: 'info', title, duration: 3000 });
    }
  };
}

/** "Added to your proposal · 3 actions · Review · Undo". */
export function showAddedToast(notice: AddedNotice, review?: () => void) {
  toaster.create({
    type: 'success',
    title: 'Added to your proposal',
    description: `${actionCountText(notice.next)} waiting for a vote. Nothing is signed until you submit it.`,
    duration: UNDO_DURATION,
    action: review ? { label: 'Review proposal', onClick: review } : undefined,
    meta: { undo: undoTo(notice.address, notice.daoId, notice.previous, 'Change taken back out') }
  });
}

/** Removing from the queue undoes from the toast instead of asking first. */
export function showRemovedToast({
  address,
  daoId,
  previous,
  label
}: {
  address: string;
  daoId: string;
  previous: ProposalQueuedAction[];
  label: string;
}) {
  toaster.create({
    type: 'info',
    title: 'Removed from your proposal',
    description: label,
    duration: UNDO_DURATION,
    meta: { undo: undoTo(address, daoId, previous, 'Change put back') }
  });
}
