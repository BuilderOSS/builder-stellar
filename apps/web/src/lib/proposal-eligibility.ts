'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import useSWR from 'swr';

import { useGovernorSettings } from '@/lib/admin-queries';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyMember } from '@/lib/goldsky-queries';
import { formatVotes, isMissingFunction } from '@/lib/vote-source';
import { useVotingPower, type VotingPowerSnapshot } from '@/lib/voting-power';

type VotesNeededKey = readonly ['votes-needed-to-propose', string, string, string];

/**
 * The votes a proposal made now needs, from the Governor's `votes_needed_to_propose` (the
 * threshold capped at the voting supply). Null for a Governor without the view, which has no cap:
 * its plain `proposal_threshold` applies.
 */
async function fetchVotesNeeded([, governor, rpcUrl, passphrase]: VotesNeededKey): Promise<bigint | null> {
  try {
    const client = new GovernorClient({ contractId: governor, rpcUrl, networkPassphrase: passphrase });
    return (await client.votes_needed_to_propose()).result;
  } catch (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
}

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
    return 'Connect a member wallet with enough voting power to create proposals.';
  }
  return `You need at least ${formatVotes(proposalThreshold, votingPower.decimals)} votes to create proposals. Current voting power: ${formatVotes(votingPower.votes, votingPower.decimals)}.`;
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
    enabled ? address || undefined : undefined
  );

  const {
    data: votesNeededNow,
    error: votesNeededError,
    isLoading: votesNeededLoading
  } = useSWR(
    enabled && address && config.governorContractId
      ? (['votes-needed-to-propose', config.governorContractId, config.rpcUrl, config.passphrase] as const)
      : null,
    fetchVotesNeeded
  );
  const votesNeeded = votesNeededNow ?? settings?.proposalThreshold;

  const loading =
    enabled && Boolean(address) && (memberLoading || votingPowerLoading || settingsLoading || votesNeededLoading);
  const error = enabled ? memberError || votingPowerError || settingsError || votesNeededError : undefined;
  const memberFound = isMember(member);
  const hasEnoughVotes = Boolean(votingPower && votesNeeded !== undefined && votingPower.votes >= votesNeeded);
  const eligible = Boolean(enabled && address && !loading && !error && memberFound && hasEnoughVotes);

  let message: string | undefined;
  if (!enabled) message = undefined;
  else if (!address) message = 'Connect a member wallet to create proposals.';
  else if (loading) message = 'Loading your voting power…';
  else if (error) message = error.message;
  else if (!memberFound) message = 'Only DAO members can create proposals.';
  else if (!hasEnoughVotes) message = formatProposalEligibilityMessage(votingPower, votesNeeded);

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
