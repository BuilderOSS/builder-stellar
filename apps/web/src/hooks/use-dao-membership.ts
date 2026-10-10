'use client';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { type GoldskyMemberItem, useGoldskyMember } from '@/lib/goldsky-queries';
import { useAuthSessionStore } from '@/stores/auth-session-store';

import { useIsLaunchAdmin } from './useIsLaunchAdmin';

function toBigInt(value: string | null | undefined) {
  try {
    return BigInt(value ?? '0');
  } catch {
    return 0n;
  }
}

export function isMemberItem(item: GoldskyMemberItem | null | undefined) {
  if (!item) return false;
  return toBigInt(item.voting_power) > 0n || toBigInt(item.owned_token_count) > 0n;
}

/**
 * The connected wallet's standing in a community: indexed tokens and voting
 * power, plus whether Manage should be offered. Manage is for members, and
 * for the launch admin while the community is still in Setup.
 */
export function useDaoMembership(config: DaoNetworkConfig) {
  const address = useAuthSessionStore((state) => state.address);
  const { data, isLoading } = useGoldskyMember(config.tokenContractId, address);
  const isLaunchAdmin = useIsLaunchAdmin(config.launchAdmin);
  const member = data?.item ?? null;
  const isMember = isMemberItem(member);

  return {
    address,
    member,
    isMember,
    isLoading: Boolean(address) && isLoading,
    isLaunchAdmin,
    canManage: isMember || (config.status === 'pending' && isLaunchAdmin),
    tokenCount: toBigInt(member?.owned_token_count),
    votingPower: toBigInt(member?.voting_power)
  };
}
