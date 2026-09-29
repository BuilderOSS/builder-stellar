'use client';

import { create } from 'zustand';

import type { AuthStatus } from '@/lib/auth/types';

type AuthSessionState = {
  address: string;
  status: string;
  authStatus: AuthStatus;
  authError: string;
  syncedAt: string;
  walletNetworkPassphrase: string;
  walletNetworkIssue: string;
};

type AuthSessionActions = {
  updateSession: (patch: Partial<AuthSessionState>) => void;
  setAuthStatus: (authStatus: AuthStatus, authError?: string) => void;
  setAuthenticatedAddress: (address: string) => void;
  resetAuth: () => void;
};

type AuthSessionStore = AuthSessionState & AuthSessionActions;

const initialState: AuthSessionState = {
  address: '',
  status: 'Disconnected',
  authStatus: 'anonymous',
  authError: '',
  syncedAt: '',
  walletNetworkPassphrase: '',
  walletNetworkIssue: ''
};

export const useAuthSessionStore = create<AuthSessionStore>((set) => ({
  ...initialState,
  updateSession: (patch) =>
    set((current) => {
      let changed = false;
      const next = { ...current };

      for (const [key, value] of Object.entries(patch) as Array<
        [keyof AuthSessionState, AuthSessionState[keyof AuthSessionState]]
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
