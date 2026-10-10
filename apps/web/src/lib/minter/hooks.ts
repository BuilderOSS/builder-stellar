'use client';

import useSWR from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';

import { claimQueryKey } from './identity';
import type { ClaimHistory, ClaimState } from './types';

export async function claimFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'Claims are unavailable.');
  return data as T;
}

export function useCurrentClaims(daoId: string, address: string | null) {
  return useSWR<ClaimState>(
    claimQueryKey(DEPLOYMENT_ID, daoId, address, 'state'),
    async () => {
      const data = await claimFetch<ClaimState>(`/api/dao/${encodeURIComponent(daoId)}/claims`);
      if (
        data.deploymentId !== DEPLOYMENT_ID ||
        data.daoId !== daoId ||
        data.tokenContractId !== daoId ||
        data.address !== address
      )
        throw new Error(
          'Claim state does not match this DAO and authenticated account. Authenticate on this network and refresh.'
        );
      return data;
    },
    { keepPreviousData: false, refreshInterval: 30000 }
  );
}

export function useClaimHistory(daoId: string, page: number) {
  return useSWR<ClaimHistory>(
    claimQueryKey(DEPLOYMENT_ID, daoId, null, 'history', page),
    async () => {
      const data = await claimFetch<ClaimHistory>(
        `/api/dao/${encodeURIComponent(daoId)}/claims/history?offset=${page * 20}`
      );
      if (data.deploymentId !== DEPLOYMENT_ID || data.daoId !== daoId)
        throw new Error('History identity does not match this DAO.');
      return data;
    },
    { keepPreviousData: false }
  );
}
