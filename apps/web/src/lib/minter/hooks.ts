'use client';

import useSWR from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { restoreFromBody } from '@/lib/restore-required';

import { claimMinterCanCloseLists } from './close-list';
import { claimQueryKey } from './identity';
import type { OpenClaimLists } from './open-lists';
import type { ClaimHistory, ClaimState } from './types';

export async function claimFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw restoreFromBody(data) ?? new Error(data.message ?? 'Claims are unavailable.');
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

/** Every open list of the tribe's ClaimMinter, and the founder supply left on Setup lists, from the index. */
export function useOpenClaimLists(daoId: string, enabled = true) {
  return useSWR<OpenClaimLists>(
    enabled && daoId ? claimQueryKey(DEPLOYMENT_ID, daoId, null, 'open-lists') : null,
    async () => {
      const data = await claimFetch<OpenClaimLists>(`/api/dao/${encodeURIComponent(daoId)}/claims/lists`);
      if (data.deploymentId !== DEPLOYMENT_ID || data.daoId !== daoId)
        throw new Error('Open claim lists do not match this DAO.');
      return data;
    },
    { keepPreviousData: false, refreshInterval: 60000 }
  );
}

/**
 * Whether the tribe's ClaimMinter can close a list early (`close_list`, after 0.5.0). Undefined
 * while it is being read; the read fails rather than guessing when the RPC cannot answer.
 */
export function useClaimMinterCanCloseLists(
  config: { claimsContractId?: string; rpcUrl: string; passphrase: string; name: string },
  enabled = true
) {
  return useSWR(
    enabled && config.claimsContractId
      ? (['claim-minter-close-list', config.claimsContractId, config.rpcUrl, config.passphrase] as const)
      : null,
    ([, contractId, rpcUrl, networkPassphrase]) =>
      claimMinterCanCloseLists({ contractId, rpcUrl, networkPassphrase, allowHttp: config.name === 'local' }),
    { revalidateOnFocus: false }
  );
}
