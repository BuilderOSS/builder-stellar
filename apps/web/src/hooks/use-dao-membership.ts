'use client';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { type GoldskyMemberItem, useGoldskyMember } from '@/lib/goldsky-queries';
import { useVoteSource } from '@/lib/vote-source';
import { useVotingPower } from '@/lib/voting-power';
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
 * power, plus whether Manage should be offered: to the launch admin while the
 * community is in Setup, and to members once it has launched.
 *
 * A tribe that votes through another source (docs/designs/governance-adapter.md)
 * takes voting power from that source, read on chain; delegation doesn't apply.
 */
export function useDaoMembership(config: DaoNetworkConfig) {
  const address = useAuthSessionStore((state) => state.address);
  const { data, isLoading } = useGoldskyMember(config.tokenContractId, address);
  const isLaunchAdmin = useIsLaunchAdmin(config.launchAdmin);
  const { voteSource } = useVoteSource(config);
  const custom = Boolean(voteSource && !voteSource.isToken);
  const sourcePower = useVotingPower(config, custom ? address || '' : '');
  const member = data?.item ?? null;
  const isMember = isMemberItem(member);

  return {
    address,
    member,
    isMember,
    isLoading: Boolean(address) && isLoading,
    isLaunchAdmin,
    // In setup only the launch admin can change anything (there are no votes yet), so a founder holding
    // a token isn't offered Manage (BUG-CAP-12). After launch, members propose changes.
    canManage: config.status === 'pending' ? isLaunchAdmin : isMember,
    tokenCount: toBigInt(member?.owned_token_count),
    votingPower: custom ? (sourcePower.data?.votes ?? 0n) : toBigInt(member?.voting_power),
    /** Decimal places of `votingPower` (0 for the token). */
    voteDecimals: custom ? (voteSource?.decimals ?? 0) : 0,
    /** True when votes come from an adapter, so token delegation doesn't apply. */
    customVoteSource: custom
  };
}
