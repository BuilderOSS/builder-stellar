'use client';

import { useEffect, useState } from 'react';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';

export interface MarketplacePreferences {
  favorites: string[];
  home: 'communities' | 'offers';
}
const empty: MarketplacePreferences = { favorites: [], home: 'communities' };
const storageKey = `marketplace:private:v1:${DEPLOYMENT_ID}`;

export function parseMarketplacePreferences(value: string | null): MarketplacePreferences {
  try {
    const body = JSON.parse(value ?? '{}');
    return {
      home: body.home === 'offers' ? 'offers' : 'communities',
      favorites: Array.isArray(body.favorites)
        ? body.favorites.filter((id: unknown) => typeof id === 'string' && /^C[A-Z2-7]{55}$/.test(id)).slice(0, 200)
        : []
    };
  } catch {
    return empty;
  }
}

export function useMarketplacePreferences() {
  const [preferences, setPreferences] = useState(empty);
  const [storageIssue, setStorageIssue] = useState('');
  useEffect(() => {
    function read() {
      try {
        setPreferences(parseMarketplacePreferences(localStorage.getItem(storageKey)));
      } catch {
        setStorageIssue('Private preferences cannot be stored in this browser.');
      }
    }
    read();
    const changed = (event: StorageEvent) => {
      if (event.key === storageKey) read();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function update(patch: Partial<MarketplacePreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setStorageIssue('Your changes are visible for this visit but could not be saved locally.');
    }
  }
  return { preferences, update, storageIssue };
}
