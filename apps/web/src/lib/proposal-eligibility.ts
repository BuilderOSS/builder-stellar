'use client';

import { useGovernorSettings } from '@/lib/admin-queries';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyMember } from '@/lib/goldsky-queries';
import { useVotingPower, type VotingPowerSnapshot } from '@/lib/voting-power';

function isMember(member: ReturnType<typeof useGoldskyMember>['data']) {
  if (!member?.item) return false;

  try {
    return BigInt(member.item.voting_power) > 0n || BigInt(member.item.owned_token_count) > 0n;
  } catch {
    return false;
  }
}

export function formatProposalEligibilityMessage(
  votingPower: VotingPowerSnapshot | undefined,
  proposalThreshold: bigint | undefined,
  errorMessage?: string
) {
  if (errorMessage) return errorMessage;
  if (!votingPower || proposalThreshold === undefined) {
    return 'Connect a DAO member wallet with enough voting power to create proposals.';
  }
  return `You need at least ${proposalThreshold.toString()} votes to create proposals. Current voting power: ${votingPower.votes.toString()}.`;
}

export function useProposalEligibility(config: DaoNetworkConfig, address: string | null, enabled = true) {
  const {
    data: member,
    error: memberError,
    isLoading: memberLoading
  } = useGoldskyMember(enabled ? config.tokenContractId : '', enabled ? address || '' : '');
  const {
    data: votingPower,
    error: votingPowerError,
    isLoading: votingPowerLoading
  } = useVotingPower(enabled ? config : { ...config, tokenContractId: '' }, enabled ? address || '' : '');
  const {
    data: settings,
    error: settingsError,
    isLoading: settingsLoading
  } = useGovernorSettings(
    enabled ? config : { ...config, governorContractId: '' },
    enabled ? address || config.adminAddress : ''
  );

  const loading = enabled && Boolean(address) && (memberLoading || votingPowerLoading || settingsLoading);
  const error = enabled ? memberError || votingPowerError || settingsError : undefined;
  const memberFound = isMember(member);
  const hasEnoughVotes = Boolean(votingPower && settings && votingPower.votes >= settings.proposalThreshold);
  const eligible = Boolean(enabled && address && !loading && !error && memberFound && hasEnoughVotes);

  let message: string | undefined;
  if (!enabled) message = undefined;
  else if (!address) message = 'Connect a DAO member wallet to create proposals.';
  else if (loading) message = 'Checking proposal eligibility...';
  else if (error) message = error.message;
  else if (!memberFound) message = 'Only DAO members can create proposals.';
  else if (!hasEnoughVotes) message = formatProposalEligibilityMessage(votingPower, settings?.proposalThreshold);

  return {
    member,
    votingPower,
    settings,
    loading,
    error,
    eligible,
    message
  };
}
