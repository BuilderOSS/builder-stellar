'use client';

import { create } from 'zustand';

import type { AuthStatus } from '@/lib/auth/types';

type DaoSessionState = {
  address: string;
  status: string;
  authStatus: AuthStatus;
  authError: string;
  syncedAt: string;
  walletNetworkPassphrase: string;
  walletNetworkIssue: string;
};

type DaoSessionActions = {
  updateSession: (patch: Partial<DaoSessionState>) => void;
  setAuthStatus: (authStatus: AuthStatus, authError?: string) => void;
  setAuthenticatedAddress: (address: string) => void;
  resetAuth: () => void;
};

type DaoSessionStore = DaoSessionState & DaoSessionActions;

const initialState: DaoSessionState = {
  address: '',
  status: 'Disconnected',
  authStatus: 'anonymous',
  authError: '',
  syncedAt: '',
  walletNetworkPassphrase: '',
  walletNetworkIssue: ''
};

export const useDaoSessionStore = create<DaoSessionStore>((set) => ({
  ...initialState,
  updateSession: (patch) =>
    set((current) => {
      let changed = false;
      const next = { ...current };

      for (const [key, value] of Object.entries(patch) as Array<
        [keyof DaoSessionState, DaoSessionState[keyof DaoSessionState]]
      >) {
        if (typeof value !== 'undefined' && next[key] !== value) {
          next[key] = value as never;
          changed = true;
        }
      }

      return changed ? next : current;
    }),
  setAuthStatus: (authStatus, authError = '') => set({ authStatus, authError }),
  setAuthenticatedAddress: (address) => set({ address, authStatus: 'authenticated', authError: '' }),
  resetAuth: () =>
    set({
      address: '',
      authStatus: 'anonymous',
      authError: '',
      status: 'Disconnected',
      syncedAt: '',
      walletNetworkPassphrase: '',
      walletNetworkIssue: ''
    })
}));
