'use client';

import { useMemo } from 'react';
import useSWR from 'swr';

import { useGovernorSettings } from '@/lib/admin-queries';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { getExplorerContractUrl } from '@/lib/explorer-links';
import { directoryFetch, directoryKey } from '@/lib/member-directory/hooks';
import type { DirectoryMember, DirectoryPage, OwnedToken } from '@/lib/member-directory/types';
import { siteHref } from '@/lib/site';
import { useTreasuryBalances } from '@/lib/treasury-queries';
import { useVoteSource } from '@/lib/vote-source';

import type { ChainFacts, Holder } from './bundle';

/**
 * Holders read for the beneficial-ownership check, ranked once by tokens owned and once by voting
 * power. Anyone at 25% or more of either is among the top four of that ranking, so one page each
 * always covers them.
 */
const HOLDER_PAGE = 25;

/** The two rankings merged into one list of holders, each address once. */
export function mergeHolders(...pages: Array<DirectoryMember[] | undefined>): Holder[] {
  const byAddress = new Map<string, Holder>();
  for (const member of pages.flatMap((page) => page ?? [])) {
    byAddress.set(member.address, {
      address: member.address,
      ownedTokens: BigInt(member.owned_token_count),
      votingPower: BigInt(member.voting_power)
    });
  }
  return [...byAddress.values()];
}

const CONTRACT_ROLES: Array<[keyof DaoNetworkConfig, string]> = [
  ['tokenContractId', 'Token (membership and DAO ID)'],
  ['governorContractId', 'Governor (proposals and votes)'],
  ['treasuryContractId', 'Treasury (holds funds, executes passed proposals)'],
  ['metadataContractId', 'Metadata (profile and artwork)'],
  ['auctionContractId', 'Auction'],
  ['marketplaceContractId', 'Marketplace'],
  ['claimsContractId', 'Claim lists']
];

export function contractList(config: DaoNetworkConfig) {
  return CONTRACT_ROLES.flatMap(([key, role]) => {
    const address = config[key];
    return typeof address === 'string' && address
      ? [{ role, address, explorerUrl: getExplorerContractUrl(config.name, address) }]
      : [];
  });
}

/** Everything the bundle takes from the chain and the index; each part loads and fails on its own. */
export function useLegalFacts(config: DaoNetworkConfig, daoId: string, routeId: string) {
  const holderPage = (by: 'votes' | 'tokens') =>
    directoryFetch<DirectoryPage<DirectoryMember>>(
      `/api/dao/${encodeURIComponent(daoId)}/members?limit=${HOLDER_PAGE}&offset=0&order=desc&by=${by}`
    );
  const members = useSWR(directoryKey(daoId, 'legal-holders'), () => holderPage('votes'));
  const owners = useSWR(directoryKey(daoId, 'legal-owners'), () => holderPage('tokens'));
  const voteSource = useVoteSource(config);
  const supply = useSWR(directoryKey(daoId, 'legal-supply'), () =>
    directoryFetch<DirectoryPage<OwnedToken> & { totalSupply: string; votingSupply: string | null }>(
      `/api/dao/${encodeURIComponent(daoId)}/tokens?limit=1&offset=0`
    )
  );
  const governor = useGovernorSettings(config, config.launchAdmin, true);
  const treasury = useTreasuryBalances(config);

  const loading = members.isLoading || owners.isLoading || supply.isLoading || governor.isLoading || treasury.isLoading;
  // Null unless both rankings loaded: one ranking alone can miss an owner (or a 25% delegate).
  const holders = useMemo(
    () => (owners.data && members.data ? mergeHolders(owners.data.items, members.data.items) : null),
    [owners.data, members.data]
  );
  const problems = [
    members.error || owners.error ? 'members' : null,
    voteSource.error ? 'vote source' : null,
    supply.error ? 'token supply' : null,
    governor.error ? 'voting rules' : null,
    treasury.error ? 'treasury balances' : null
  ].filter((p): p is string => Boolean(p));

  /** The facts as of now; call it at export time so `generatedAt` is the moment of download. */
  function snapshot(): ChainFacts {
    const g = governor.data;
    return {
      generatedAt: new Date().toISOString(),
      network: config.name,
      networkPassphrase: config.passphrase,
      tribe: {
        name: config.label || config.tokenName,
        daoId,
        url: siteHref(daoRoute(routeId)),
        status: config.status,
        links: config.profile.links
      },
      token: {
        name: config.tokenName,
        symbol: config.tokenSymbol,
        totalSupply: supply.data?.totalSupply ?? null,
        votingSupply: supply.data?.votingSupply ?? null,
        ...config.tokenSettings
      },
      voteSource: voteSource.voteSource
        ? { address: voteSource.voteSource.address, isToken: voteSource.voteSource.isToken }
        : null,
      launchModes: {
        auction: Boolean(config.auctionContractId) && config.auctionEnabled !== false,
        claims: Boolean(config.claimsContractId),
        marketplace: Boolean(config.marketplaceContractId) && config.marketplaceEnabled !== false
      },
      contracts: contractList(config),
      governance: g
        ? {
            votingDelaySeconds: g.votingDelay,
            votingPeriodSeconds: g.votingPeriod,
            proposalThreshold: g.proposalThreshold.toString(),
            quorumBps: g.quorumBps,
            safetyDelaySeconds: g.queueDelay ?? null
          }
        : null,
      treasury: {
        address: config.treasuryContractId,
        balances: treasury.data
          ? treasury.data.map((b) => ({
              asset: b.isNative ? 'XLM' : `${b.assetCode}${b.assetIssuer ? ` (${b.assetIssuer})` : ''}`,
              amount: b.balance
            }))
          : null
      },
      members: {
        count: members.data?.total ?? null,
        holders
      }
    };
  }

  return {
    loading,
    problems,
    snapshot,
    votingSupply: supply.data?.votingSupply ?? null,
    totalSupply: supply.data?.totalSupply ?? null,
    holders
  };
}
