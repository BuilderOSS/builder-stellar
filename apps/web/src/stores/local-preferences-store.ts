'use client';
import type { LaunchConfig } from '@builder-stellar/manager-bindings';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SignedSubmission, SubmissionStatus, WorkspaceScope } from './create-dao-store';

export const preferenceScopeKey = (scope: WorkspaceScope) =>
  JSON.stringify([scope.network, scope.deployment, scope.wallet]);
export type HomeDao = { id: string; name: string };
export type LocalLaunch = {
  auction: boolean;
  marketplace: boolean;
  minter: boolean;
  status?: SubmissionStatus;
  reviewedConfig?: LaunchConfig;
} & SignedSubmission;
let saveError = '';
let readFailed = false;
const launchReceiptKey = (key: string) => `dao.local-preferences.v1.receipt:${key}`;
function withLaunchReceipts(launches: Record<string, LocalLaunch>) {
  if (typeof window === 'undefined') return launches;
  const merged = { ...launches };
  const storage = window.localStorage;
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    const prefix = 'dao.local-preferences.v1.receipt:';
    if (name?.startsWith(prefix)) merged[name.slice(prefix.length)] = JSON.parse(storage.getItem(name)!);
  }
  for (const key of Object.keys(merged)) {
    const raw = storage.getItem(launchReceiptKey(key));
    if (raw) merged[key] = JSON.parse(raw);
  }
  return merged;
}
export function assertPreferencesSaved() {
  if (saveError) throw new Error(saveError);
}
export const useLocalPreferencesStore = create<{
  homes: Record<string, HomeDao>;
  launches: Record<string, LocalLaunch>;
  setHome: (scope: WorkspaceScope, dao: HomeDao | null) => void;
  setLaunch: (key: string, choice: LocalLaunch) => void;
}>()(
  persist(
    (set, get) => ({
      homes: {},
      launches: {},
      setHome: (scope, dao) => {
        const latest = readPreferences(get());
        const key = preferenceScopeKey(scope);
        const homes = { ...latest.homes };
        if (dao) homes[key] = dao;
        else delete homes[key];
        set({ homes, launches: latest.launches });
      },
      setLaunch: (key, choice) => {
        const latest = readPreferences(get());
        const existing = latest.launches[key];
        if (existing?.hash && !['failed', 'expired', 'rejected'].includes(existing.status ?? '') && !choice.hash)
          throw new Error('A signed launch is saved. Recover it before changing launch choices.');
        try {
          if (typeof window !== 'undefined' && choice.hash)
            window.localStorage.setItem(launchReceiptKey(key), JSON.stringify(choice));
          else if (typeof window !== 'undefined' && ['failed', 'expired', 'rejected'].includes(existing?.status ?? ''))
            window.localStorage.removeItem(launchReceiptKey(key));
        } catch {
          saveError = 'Could not save the launch transaction receipt. Free browser storage before signing.';
          throw new Error(saveError);
        }
        set({ homes: latest.homes, launches: { ...latest.launches, [key]: choice } });
      }
    }),
    {
      name: 'dao.local-preferences.v1',
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
            if (raw) {
              const envelope = JSON.parse(raw);
              envelope.state.launches = withLaunchReceipts(envelope.state.launches ?? {});
              readFailed = false;
              return JSON.stringify(envelope);
            }
            readFailed = false;
            return raw;
          } catch {
            readFailed = true;
            saveError = 'Local preference storage is unavailable';
            return null;
          }
        },
        setItem: (key, value) => {
          if (readFailed) return;
          try {
            if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
            saveError = '';
          } catch {
            saveError = 'Could not save local transaction recovery data. Free browser storage before signing.';
          }
        },
        removeItem: (key) => {
          if (typeof window !== 'undefined') window.localStorage.removeItem(key);
        }
      }))
    }
  )
);

function readPreferences(fallback: { homes: Record<string, HomeDao>; launches: Record<string, LocalLaunch> }) {
  if (typeof window === 'undefined' || readFailed) return fallback;
  try {
    const raw = window.localStorage.getItem('dao.local-preferences.v1');
    const saved = raw ? JSON.parse(raw).state : fallback;
    return { homes: saved.homes ?? {}, launches: withLaunchReceipts(saved.launches ?? {}) };
  } catch {
    readFailed = true;
    saveError = 'Could not read local preference recovery data. Existing data is preserved.';
    return fallback;
  }
}
