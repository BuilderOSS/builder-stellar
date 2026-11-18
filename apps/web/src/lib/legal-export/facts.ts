'use client';

import useSWR from 'swr';

import { useGovernorSettings } from '@/lib/admin-queries';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { daoRoute } from '@/lib/dao-routes';
import { getExplorerContractUrl } from '@/lib/explorer-links';
import { directoryFetch, directoryKey } from '@/lib/member-directory/hooks';
import type { DirectoryMember, DirectoryPage, OwnedToken } from '@/lib/member-directory/types';
import { siteHref } from '@/lib/site';
import { useTreasuryBalances } from '@/lib/treasury-queries';

import type { ChainFacts } from './bundle';

/**
 * Holders read for the beneficial-ownership check. Anyone at 25% or more is among the top four,
 * so the first page always covers them.
 */
const HOLDER_PAGE = 25;

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
  const members = useSWR(directoryKey(daoId, 'legal-holders'), () =>
    directoryFetch<DirectoryPage<DirectoryMember>>(
      `/api/dao/${encodeURIComponent(daoId)}/members?limit=${HOLDER_PAGE}&offset=0&order=desc`
    )
  );
  const supply = useSWR(directoryKey(daoId, 'legal-supply'), () =>
    directoryFetch<DirectoryPage<OwnedToken> & { totalSupply: string; votingSupply: string | null }>(
      `/api/dao/${encodeURIComponent(daoId)}/tokens?limit=1&offset=0`
    )
  );
  const governor = useGovernorSettings(config, config.launchAdmin, true);
  const treasury = useTreasuryBalances(config);

  const loading = members.isLoading || supply.isLoading || governor.isLoading || treasury.isLoading;
  const problems = [
    members.error ? 'members' : null,
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
        holders: (members.data?.items ?? []).map((m) => ({ address: m.address, votingPower: BigInt(m.voting_power) }))
      }
    };
  }

  return {
    loading,
    problems,
    snapshot,
    votingSupply: supply.data?.votingSupply ?? null,
    holders: members.data?.items ?? []
  };
}
