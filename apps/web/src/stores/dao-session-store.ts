'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type DaoSessionState = {
  address: string;
  status: string;
  syncedAt: string;
  walletNetworkPassphrase: string;
  walletNetworkIssue: string;
};

type DaoSessionActions = {
  updateSession: (patch: Partial<DaoSessionState>) => void;
};

type DaoSessionStore = DaoSessionState & DaoSessionActions;

const initialState: DaoSessionState = {
  address: '',
  status: 'Disconnected',
  syncedAt: '',
  walletNetworkPassphrase: '',
  walletNetworkIssue: ''
};

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage : window.localStorage));

export const useDaoSessionStore = create<DaoSessionStore>()(
  persist(
    (set) => ({
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
        })
    }),
    {
      name: 'dao.session.v1',
      storage,
      partialize: (state) => ({
        address: state.address,
        status: state.status,
        syncedAt: state.syncedAt,
        walletNetworkPassphrase: state.walletNetworkPassphrase,
        walletNetworkIssue: state.walletNetworkIssue
      })
    }
  )
);
