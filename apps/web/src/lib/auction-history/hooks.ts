'use client';

import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import useSWR from 'swr';

import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import type { DaoNetworkConfig } from '@/lib/dao-config';

import type { AuctionHistoryPage, CurrentAuction } from './types';

export function auctionQueryKey(
  config: DaoNetworkConfig,
  daoId: string,
  resource: string,
  value: string | number = ''
) {
  return [
    'auction-buyer',
    DEPLOYMENT_ID,
    daoId,
    config.tokenContractId,
    config.auctionContractId,
    config.name,
    config.rpcUrl,
    config.passphrase,
    resource,
    value
  ] as const;
}

export async function auctionFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Auction data unavailable.');
  return body as T;
}

export async function fetchAuctionHistory(config: DaoNetworkConfig, daoId: string, page: number) {
  const result = await auctionFetch<AuctionHistoryPage>(
    `/api/dao/${encodeURIComponent(daoId)}/auctions/history?limit=12&offset=${page * 12}&network=${config.name}`
  );
  if (
    result.deploymentId !== DEPLOYMENT_ID ||
    result.daoId !== config.tokenContractId ||
    result.contractId !== config.auctionContractId ||
    result.network !== config.name
  )
    throw new Error('Auction history identity mismatch.');
  return result;
}

export function useAuctionHistory(config: DaoNetworkConfig, daoId: string, page: number) {
  return useSWR(config.auctionContractId ? auctionQueryKey(config, daoId, 'history', page) : null, () =>
    fetchAuctionHistory(config, daoId, page)
  );
}

export function useCurrentAuction(config: DaoNetworkConfig, daoId: string) {
  return useSWR(
    config.auctionContractId ? auctionQueryKey(config, daoId, 'current') : null,
    () => auctionFetch<CurrentAuction>(`/api/dao/${encodeURIComponent(daoId)}/auctions`),
    { refreshInterval: 15_000 }
  );
}

export function useBuyerRefund(config: DaoNetworkConfig, daoId: string, bidder: string) {
  // No keepPreviousData: never show another network/account's refund during a key change.
  return useSWR(
    config.auctionContractId && bidder ? auctionQueryKey(config, daoId, 'refund', bidder) : null,
    async () => {
      const client = new AuctionClient({
        contractId: config.auctionContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: bidder,
        allowHttp: config.name === 'local'
      });
      return (await client.pending_refund({ bidder })).result;
    },
    { refreshInterval: 30_000 }
  );
}
