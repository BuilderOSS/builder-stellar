'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import useSWR from 'swr';

import { useGovernorSettings } from '@/lib/admin-queries';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useGoldskyMember } from '@/lib/goldsky-queries';
import { votesNeededToPropose } from '@/lib/governance-limits';
import { formatVotes, useVoteSource } from '@/lib/vote-source';
import { useVotingPower, type VotingPowerSnapshot } from '@/lib/voting-power';

type VotingSupplyKey = readonly ['voting-supply-previous-ledger', string, string, string];

/**
 * The vote source's voting supply at the previous ledger, the supply `propose` caps the threshold
 * at. Every vote source implements `voting_supply_at_previous_ledger` (common::clients::VoteSourceApi),
 * so the token's client reads an adapter too.
 */
async function fetchVotingSupply([, sourceContractId, rpcUrl, passphrase]: VotingSupplyKey) {
  const source = new TokenClient({ contractId: sourceContractId, rpcUrl, networkPassphrase: passphrase });
  return (await source.voting_supply_at_previous_ledger()).result;
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

  const { voteSource } = useVoteSource(enabled ? config : { ...config, tokenContractId: '' });
  // The cap only matters when the supply is below the threshold; if this read fails, the
  // threshold itself is the requirement shown.
  const { data: votingSupply } = useSWR(
    enabled && address && voteSource
      ? (['voting-supply-previous-ledger', voteSource.address, config.rpcUrl, config.passphrase] as const)
      : null,
    fetchVotingSupply
  );
  const votesNeeded = settings ? votesNeededToPropose(settings.proposalThreshold, votingSupply) : undefined;

  const loading = enabled && Boolean(address) && (memberLoading || votingPowerLoading || settingsLoading);
  const error = enabled ? memberError || votingPowerError || settingsError : undefined;
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
