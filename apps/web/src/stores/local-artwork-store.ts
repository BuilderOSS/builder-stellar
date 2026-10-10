'use client';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ArtworkPlan } from '@/components/create-dao/artwork-configuration';

let error = '';
let readFailed = false;
const receiptKey = (key: string) => `dao.local-artwork.v1.receipt:${key}`;
function withArtworkReceipts(plans: Record<string, ArtworkPlan>) {
  if (typeof window === 'undefined') return plans;
  const merged = { ...plans };
  const storage = window.localStorage;
  const prefix = 'dao.local-artwork.v1.receipt:';
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    if (name?.startsWith(prefix)) merged[name.slice(prefix.length)] = JSON.parse(storage.getItem(name)!);
  }
  return Object.fromEntries(
    Object.entries(merged).map(([key, plan]) => {
      const raw = window.localStorage.getItem(receiptKey(key));
      return [key, raw ? (JSON.parse(raw) as ArtworkPlan) : plan];
    })
  );
}
export function assertArtworkSaved() {
  if (error) throw new Error(error);
}
export const useLocalArtworkStore = create<{
  plans: Record<string, ArtworkPlan>;
  setPlan: (key: string, plan: ArtworkPlan) => void;
}>()(
  persist(
    (set, get) => ({
      plans: {},
      setPlan: (key, plan) => {
        let plans = get().plans;
        try {
          const raw = typeof window === 'undefined' ? null : window.localStorage.getItem('dao.local-artwork.v1');
          if (raw) plans = withArtworkReceipts(JSON.parse(raw).state.plans);
        } catch {
          readFailed = true;
          error = 'Cannot read local artwork recovery data. Existing data is preserved.';
        }
        const receipt = typeof window === 'undefined' ? null : window.localStorage.getItem(receiptKey(key));
        const existing = receipt ? (JSON.parse(receipt) as ArtworkPlan) : plans[key];
        if (
          existing &&
          (plan.confirmedBatches < existing.confirmedBatches ||
            (existing.hash &&
              existing.status !== 'failed' &&
              !plan.hash &&
              plan.confirmedBatches <= existing.confirmedBatches))
        )
          throw new Error('Artwork has a saved transaction or confirmed batch. Recover it before changing the plan.');
        if (plan.hash || plan.confirmedBatches) {
          try {
            if (typeof window !== 'undefined') window.localStorage.setItem(receiptKey(key), JSON.stringify(plan));
          } catch {
            error = 'Could not save the artwork transaction receipt. Free browser storage before signing.';
            throw new Error(error);
          }
        }
        set({ plans: { ...plans, [key]: plan } });
      }
    }),
    {
      name: 'dao.local-artwork.v1',
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
            if (raw) {
              const envelope = JSON.parse(raw);
              envelope.state.plans = withArtworkReceipts(envelope.state.plans);
              readFailed = false;
              return JSON.stringify(envelope);
            }
            readFailed = false;
            return raw;
          } catch {
            readFailed = true;
            error = 'Could not read local artwork plans';
            return null;
          }
        },
        setItem: (key, value) => {
          if (readFailed) return;
          try {
            if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
            error = '';
          } catch {
            error = 'Could not save the artwork recovery record. Free browser storage before signing.';
          }
        },
        removeItem: (key) => {
          if (typeof window !== 'undefined') window.localStorage.removeItem(key);
        }
      }))
    }
  )
);
