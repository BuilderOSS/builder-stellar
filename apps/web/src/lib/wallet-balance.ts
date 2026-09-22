'use client';

import useSWR from 'swr';

import type { NetworkName } from '@/config/networks';

type HorizonAccount = {
  balances?: Array<{ asset_type: string; balance: string }>;
};

function getHorizonUrl(network: NetworkName) {
  if (network === 'public') return 'https://horizon.stellar.org';
  if (network === 'testnet') return 'https://horizon-testnet.stellar.org';
  return null;
}

async function fetchWalletBalance([, network, address]: readonly ['wallet-balance', NetworkName, string]) {
  const horizonUrl = getHorizonUrl(network);
  if (!horizonUrl) return null;

  const response = await fetch(`${horizonUrl}/accounts/${address}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load wallet balance');

  const account = (await response.json()) as HorizonAccount;
  return account.balances?.find((item) => item.asset_type === 'native')?.balance ?? '0';
}

export function useWalletBalance(address: string, network: NetworkName) {
  const key = address ? (['wallet-balance', network, address] as const) : null;

  return useSWR(key, fetchWalletBalance, {
    refreshInterval: 30_000,
    revalidateOnFocus: true
  });
}
