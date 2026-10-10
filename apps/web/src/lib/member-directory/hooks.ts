'use client';

import useSWR from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';

import type { DirectoryMember, DirectoryPage, DirectoryProfile, OwnedToken } from './types';

export function directoryKey(daoId: string, resource: string, value: string | number = '') {
  return ['member-directory', DEPLOYMENT_ID, daoId, resource, value] as const;
}
export async function directoryFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'This data is unavailable. Try again.');
  return body as T;
}
export function useDirectoryMembers(daoId: string, page: number) {
  return useSWR(directoryKey(daoId, 'members', page), () =>
    directoryFetch<DirectoryPage<DirectoryMember>>(
      `/api/dao/${encodeURIComponent(daoId)}/members?limit=25&offset=${page * 25}`
    )
  );
}
export function useDirectoryMember(daoId: string, address: string | null) {
  return useSWR(address ? directoryKey(daoId, 'profile', address) : null, () =>
    directoryFetch<DirectoryProfile>(
      `/api/dao/${encodeURIComponent(daoId)}/members?address=${encodeURIComponent(address!)}`
    )
  );
}
export function useDirectoryTokens(daoId: string, address: string | null, page: number) {
  return useSWR(address ? directoryKey(daoId, `owned:${address}`, page) : null, () =>
    directoryFetch<DirectoryPage<OwnedToken>>(
      `/api/dao/${encodeURIComponent(daoId)}/tokens?owner=${encodeURIComponent(address!)}&limit=25&offset=${page * 25}`
    )
  );
}
