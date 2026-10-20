'use client';

import { create } from 'zustand';

import type { ActionRequest } from '@/lib/proposal-actions/action-request';
import type { ActionFinding } from '@/lib/proposal-actions/review';

/** An action waiting for the member to choose replace, keep both or skip, shown by the one ProposeActionDialog. */
export type PendingAction = {
  address: string;
  daoId: string;
  request: ActionRequest;
  findings: ActionFinding[];
  summaries: string[];
  onAdded?: () => void;
};

type PendingActionStore = {
  pending: PendingAction | null;
  /** Bumps with each review, so the dialog mounts above any sheet that is open when it asks. */
  openCount: number;
  open: (pending: PendingAction) => void;
  close: () => void;
};

export const usePendingActionStore = create<PendingActionStore>()((set) => ({
  pending: null,
  openCount: 0,
  open: (pending) => set((state) => ({ pending, openCount: state.openCount + 1 })),
  close: () => set({ pending: null })
}));
