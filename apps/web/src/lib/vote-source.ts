'use client';

import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { contract } from '@stellar/stellar-sdk';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';

/**
 * Where a tribe's voting power comes from (docs/designs/governance-adapter.md): its token
 * (token-weighted) or an adapter the Manager approved at creation. Fixed for the tribe's life.
 */
export type VoteSource = {
  /** The contract the Governor reads votes from. */
  address: string;
  /** True when it is the tribe's own token. */
  isToken: boolean;
  /** Decimal places of one vote: 0 for the token, the adapter's `decimals()` otherwise. */
  decimals: number;
};

export type ApprovedVoteSource = { source: string; name: string };

/** The token-weighted default, used until the Governor answers (and by Governors older than the view). */
export function tokenVoteSource(token: string): VoteSource {
  return { address: token, isToken: true, decimals: 0 };
}

async function fetchVoteSource([, governor, token, rpcUrl, passphrase]: readonly [
  'vote-source',
  string,
  string,
  string,
  string
]): Promise<VoteSource> {
  const options = { rpcUrl, networkPassphrase: passphrase, allowHttp: rpcUrl.startsWith('http://') };
  let address = token;
  try {
    address = (await new GovernorClient({ ...options, contractId: governor }).vote_source()).result;
  } catch {
    // A Governor older than vote_source() votes with the token.
  }
  if (address === token) return tokenVoteSource(token);
  // The adapter's spec is read from chain; `decimals` is part of the vote source interface.
  const adapter = await contract.Client.from({ ...options, contractId: address });
  const decimals = await (adapter as unknown as { decimals: () => Promise<{ result: number }> })
    .decimals()
    .then((tx) => Number(tx.result))
    .catch(() => 0);
  return { address, isToken: false, decimals };
}

/** The tribe's vote source, read from its Governor. */
export function useVoteSource(
  config: Pick<DaoNetworkConfig, 'governorContractId' | 'tokenContractId' | 'rpcUrl' | 'passphrase'>
) {
  const key =
    config.governorContractId && config.tokenContractId
      ? (['vote-source', config.governorContractId, config.tokenContractId, config.rpcUrl, config.passphrase] as const)
      : null;
  const swr = useSWR(key, fetchVoteSource, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return {
    ...swr,
    /** The token until the Governor answers. */
    voteSource: swr.data ?? (config.tokenContractId ? tokenVoteSource(config.tokenContractId) : null)
  };
}

/** Voting power in display units: `units / 10^decimals`, up to 4 decimal places, trailing zeros trimmed. */
export function formatVotes(units: bigint, decimals: number): string {
  if (decimals <= 0) return units.toString();
  const scale = 10n ** BigInt(decimals);
  const fraction = (units % scale).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  return fraction ? `${units / scale}.${fraction}` : `${units / scale}`;
}

/** Whether the Manager approves `source` for new tribes now (the chain's answer, not the index). */
export async function isVoteSourceApproved(source: string): Promise<boolean> {
  const deployment = getDeploymentConfig();
  const manager = new ManagerClient({
    contractId: deployment.managerAddress,
    rpcUrl: deployment.rpcUrl,
    networkPassphrase: deployment.networkPassphrase,
    allowHttp: deployment.rpcUrl.startsWith('http://')
  });
  return (await manager.is_vote_source_approved({ source })).result;
}

async function fetchApprovedVoteSources(): Promise<ApprovedVoteSource[]> {
  const response = await fetch('/api/platform/vote-sources', { cache: 'no-store' });
  if (!response.ok) return [];
  const body = (await response.json()) as { sources?: ApprovedVoteSource[] };
  const indexed = body.sources ?? [];
  // The index can lag a withdrawal: keep only what the Manager still approves.
  const checked = await Promise.all(
    indexed.map((entry) =>
      isVoteSourceApproved(entry.source)
        .then((approved) => (approved ? entry : null))
        .catch(() => null)
    )
  );
  return checked.filter((entry): entry is ApprovedVoteSource => entry !== null);
}

/** Approved vote sources for new tribes; empty (so the picker hides) when none or the index is down. */
export function useApprovedVoteSources() {
  return useSWR('approved-vote-sources', fetchApprovedVoteSources, { revalidateOnFocus: false });
}
