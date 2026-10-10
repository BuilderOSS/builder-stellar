'use client';

import useSWR from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import type {
  DaoMarketplace,
  MarketplaceDirectory,
  MarketplaceInventory,
  MarketplaceListing,
  MarketplaceOffers,
  MarketplaceReadiness
} from './types';

export function marketplaceKey(daoId: string | null, resource: string, url: string, address = '') {
  return ['marketplace', DEPLOYMENT_ID, daoId ?? 'global', resource, url, address] as const;
}
export async function marketplaceFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Marketplace request failed.');
  if (body.deploymentId && body.deploymentId !== DEPLOYMENT_ID)
    throw new Error('Marketplace deployment mismatch. Reload this page.');
  return body as T;
}
export async function marketplaceFetchKey<T>(key: readonly string[]): Promise<T> {
  const result = await marketplaceFetch<T>(key[4]);
  const identity = result as { deploymentId?: string; daoId?: string; community?: { daoId: string }; address?: string };
  if (identity.deploymentId !== key[1]) throw new Error('Marketplace response has no valid deployment identity.');
  if (key[2] !== 'global' && (identity.daoId ?? identity.community?.daoId) !== key[2])
    throw new Error('Marketplace DAO response mismatch.');
  if (key[5] && identity.address !== key[5])
    throw new Error('The authenticated account changed. Refresh this wallet session.');
  return result;
}
const fetchKey = marketplaceFetchKey;
const options = { refreshInterval: 15_000, shouldRetryOnError: false };

export function useMarketplaceDirectory(query: string) {
  return useSWR<MarketplaceDirectory>(
    marketplaceKey(null, 'directory', `/api/marketplace?${query}`),
    fetchKey,
    options
  );
}
export function useMarketplaceOffers(query: string, enabled: boolean) {
  return useSWR<MarketplaceOffers>(
    enabled ? marketplaceKey(null, 'offers', `/api/marketplace/offers?${query}`) : null,
    fetchKey,
    options
  );
}
export function useDaoMarketplace(daoId: string, query = '') {
  return useSWR<DaoMarketplace>(
    marketplaceKey(daoId, 'dao', `/api/dao/${encodeURIComponent(daoId)}/marketplace?${query}`),
    fetchKey,
    options
  );
}
export function useMarketplaceListing(daoId: string, kind: string, id: string, eventId: string) {
  const query = new URLSearchParams({ kind, id, eventId }).toString();
  return useSWR<{ deploymentId: string; daoId: string; listing: MarketplaceListing }>(
    id && eventId && ['primary', 'secondary'].includes(kind)
      ? marketplaceKey(daoId, 'listing', `/api/dao/${encodeURIComponent(daoId)}/marketplace/listing?${query}`)
      : null,
    fetchKey,
    options
  );
}
export function useMarketplaceInventory(daoId: string, page = 0) {
  const address = useAuthSessionStore((s) => (s.authStatus === 'authenticated' ? s.address : ''));
  return useSWR<MarketplaceInventory>(
    address
      ? marketplaceKey(
          daoId,
          'inventory',
          `/api/dao/${encodeURIComponent(daoId)}/marketplace/inventory?page=${page}`,
          address
        )
      : null,
    fetchKey,
    options
  );
}
export function useMarketplaceReadiness(daoId: string, asset: string | null, enabled: boolean) {
  const address = useAuthSessionStore((s) => (s.authStatus === 'authenticated' ? s.address : ''));
  return useSWR<MarketplaceReadiness>(
    address && asset && enabled
      ? marketplaceKey(
          daoId,
          'readiness',
          `/api/dao/${encodeURIComponent(daoId)}/marketplace/readiness?asset=${encodeURIComponent(asset)}`,
          address
        )
      : null,
    fetchKey,
    options
  );
}
