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
  open: (pending: PendingChange) => void;
  close: () => void;
};

export const usePendingChangeStore = create<PendingChangeStore>()((set) => ({
  pending: null,
  open: (pending) => set({ pending }),
  close: () => set({ pending: null })
}));
