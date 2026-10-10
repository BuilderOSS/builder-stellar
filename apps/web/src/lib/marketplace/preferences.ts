'use client';

import { useEffect, useState } from 'react';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';

export interface MarketplacePreferences {
  favorites: string[];
  labels: Record<string, string>;
  home: 'communities' | 'offers';
}
const empty: MarketplacePreferences = { favorites: [], labels: {}, home: 'communities' };
const storageKey = `marketplace:private:v1:${DEPLOYMENT_ID}`;

export function parseMarketplacePreferences(value: string | null): MarketplacePreferences {
  try {
    const body = JSON.parse(value ?? '{}');
    const labels: Record<string, string> = {};
    if (body.labels && typeof body.labels === 'object') {
      for (const [key, label] of Object.entries(body.labels).slice(0, 200)) {
        if (/^C[A-Z2-7]{55}$/.test(key) && typeof label === 'string') labels[key] = label.slice(0, 60);
      }
    }
    return {
      home: body.home === 'offers' ? 'offers' : 'communities',
      labels,
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
