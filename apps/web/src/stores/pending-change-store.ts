'use client';

import { create } from 'zustand';

import type { ChangeRequest } from '@/lib/proposal-changes/change-request';
import type { ChangeFinding } from '@/lib/proposal-changes/review';

/** A change waiting for the member to choose replace, keep both or skip, shown by the one ProposeChangeDialog. */
export type PendingChange = {
  address: string;
  daoId: string;
  request: ChangeRequest;
  findings: ChangeFinding[];
  summaries: string[];
  onAdded?: () => void;
};

type PendingChangeStore = {
  pending: PendingChange | null;
  /** Bumps with each review, so the dialog mounts above any sheet that is open when it asks. */
  openCount: number;
  open: (pending: PendingChange) => void;
  close: () => void;
};

export const usePendingChangeStore = create<PendingChangeStore>()((set) => ({
  pending: null,
  openCount: 0,
  open: (pending) => set((state) => ({ pending, openCount: state.openCount + 1 })),
  close: () => set({ pending: null })
}));
