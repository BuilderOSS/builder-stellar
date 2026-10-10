'use client';

import useSWR from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import type { TreasuryHistory, TreasuryReadiness, TreasuryScope } from './types';
import { assertTreasuryIdentity } from './values';

export function clientTreasuryScope(daoId: string, config: DaoNetworkConfig): TreasuryScope {
  return {
    deploymentId: DEPLOYMENT_ID,
    daoId,
    treasuryContractId: config.treasuryContractId,
    governorContractId: config.governorContractId
  };
}
export function treasuryKey(scope: TreasuryScope, resource: string, url: string, address = '') {
  return [
    'treasury',
    scope.deploymentId,
    scope.daoId,
    scope.treasuryContractId,
    scope.governorContractId,
    resource,
    url,
    address
  ] as const;
}
export async function treasuryFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Treasury request failed.');
  return body as T;
}
export async function treasuryFetchKey<T extends TreasuryScope>(key: ReturnType<typeof treasuryKey>): Promise<T> {
  const result = await treasuryFetch<T>(key[6]);
  assertTreasuryIdentity(result, {
    deploymentId: key[1],
    daoId: key[2],
    treasuryContractId: key[3],
    governorContractId: key[4]
  });
  if (key[7] && (result as T & { address: string }).address !== key[7])
    throw new Error('Authenticated treasury account changed. Refresh your session.');
  return result;
}
const options = { refreshInterval: 30_000, keepPreviousData: false, shouldRetryOnError: false };
export function useTreasuryHistory(scope: TreasuryScope, page: number) {
  return useSWR<TreasuryHistory>(
    scope.treasuryContractId
      ? treasuryKey(scope, 'history', `/api/dao/${encodeURIComponent(scope.daoId)}/treasury/history?page=${page}`)
      : null,
    treasuryFetchKey,
    options
  );
}
export function useTreasuryFundingReadiness(scope: TreasuryScope, code: string) {
  const address = useAuthSessionStore((s) => (s.authStatus === 'authenticated' ? s.address : ''));
  return useSWR<TreasuryReadiness>(
    scope.treasuryContractId && address
      ? treasuryKey(
          scope,
          'readiness',
          `/api/dao/${encodeURIComponent(scope.daoId)}/treasury/readiness?assetCode=${encodeURIComponent(code)}`,
          address
        )
      : null,
    treasuryFetchKey,
    options
  );
}
