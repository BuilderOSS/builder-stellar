import useSWR from 'swr';

import type { TokenInventoryResponse, TokenMetadataResponse } from '@/lib/token-types';

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T;
  if (!response.ok) {
    throw new Error((json as { message?: string }).message || 'Request failed');
  }
  return json;
}

export function useTokenInventory(daoId: string) {
  return useSWR<TokenInventoryResponse>(`/api/dao/${encodeURIComponent(daoId)}/tokens`, fetchJson, {
    keepPreviousData: true
  });
}

export function useTokenMetadata(daoId: string, tokenId: number | null) {
  const key = typeof tokenId === 'number' ? `/api/dao/${encodeURIComponent(daoId)}/token/${tokenId}` : null;
  return useSWR<TokenMetadataResponse>(key, fetchJson, { keepPreviousData: true });
}
