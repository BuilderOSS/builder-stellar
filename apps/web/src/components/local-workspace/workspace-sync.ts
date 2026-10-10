'use client';
import { useEffect } from 'react';

import { CREATE_WORKSPACE_KEY, useCreateDaoStore } from '@/stores/create-dao-store';
import { useLocalArtworkStore } from '@/stores/local-artwork-store';
import { useLocalPreferencesStore } from '@/stores/local-preferences-store';

export function useWorkspaceSync() {
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === CREATE_WORKSPACE_KEY) void useCreateDaoStore.persist.rehydrate();
      if (event.key === 'dao.local-preferences.v1') void useLocalPreferencesStore.persist.rehydrate();
      if (event.key === 'dao.local-artwork.v1') void useLocalArtworkStore.persist.rehydrate();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
}
