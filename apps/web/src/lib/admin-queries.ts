import { Client as AuctionClient } from '@builder-stellar/auction-bindings';
import { Client as GovernorClient } from '@builder-stellar/governor-bindings';
import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import useSWR from 'swr';

import { type DaoNetworkConfig, readSource } from '@/lib/dao-config';

export type GovernorSettings = {
  votingDelay: number;
  votingPeriod: number;
  proposalThreshold: bigint;
  quorumBps: number;
  latestLedger: number;
  /** 'indexed' from governance.settings, 'chain' from RPC reads. */
  source: 'indexed' | 'chain';
  queueDelay?: number;
};

type GovernorSettingsKey = readonly ['governor-settings', string, string, string, string, string];

async function indexedGovernorSettings(daoId: string): Promise<GovernorSettings | null> {
  const response = await fetch(`/api/dao/${daoId}/governance/settings`, { cache: 'no-store' });
  if (!response.ok) return null;
  const { settings } = (await response.json()) as {
    settings: {
      votingDelay: number | null;
      votingPeriod: number | null;
      queueDelay: number | null;
      proposalThreshold: string | null;
      quorumBps: number | null;
    } | null;
  };
  if (
    !settings ||
    settings.votingDelay === null ||
    settings.votingPeriod === null ||
    settings.proposalThreshold === null ||
    settings.quorumBps === null
  )
    return null;
  return {
    votingDelay: settings.votingDelay,
    votingPeriod: settings.votingPeriod,
    proposalThreshold: BigInt(settings.proposalThreshold),
    quorumBps: settings.quorumBps,
    queueDelay: settings.queueDelay ?? undefined,
    latestLedger: 0,
    source: 'indexed'
  };
}

async function fetchGovernorSettings([, contractId, rpcUrl, passphrase, publicKey, indexedDaoId]: GovernorSettingsKey) {
  if (!contractId) {
    throw new Error('Missing governor contract id in the active network config.');
  }
  // Prefer the indexed configuration when requested; fall back to RPC reads.
  if (indexedDaoId) {
    const indexed = await indexedGovernorSettings(indexedDaoId).catch(() => null);
    if (indexed) return indexed;
  }

  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  const client = new GovernorClient({
    contractId,
    rpcUrl,
    networkPassphrase: passphrase,
    publicKey: readSource(publicKey)
  });
  const latestLedger = await server.getLatestLedger();

  const [votingDelay, votingPeriod, proposalThreshold, quorumBps] = await Promise.all([
    client.voting_delay(),
    client.voting_period(),
    client.proposal_threshold(),
    client.quorum_bps()
  ]);

  return {
    votingDelay: votingDelay.result,
    votingPeriod: votingPeriod.result,
    proposalThreshold: proposalThreshold.result,
    quorumBps: quorumBps.result,
    latestLedger: latestLedger.sequence,
    source: 'chain'
  } satisfies GovernorSettings;
}

/**
 * `publicKey` is only a simulation source; reads work without it. With
 * `preferIndexed`, governance.settings is read first and RPC is the fallback.
 */
export function useGovernorSettings(config: DaoNetworkConfig, publicKey?: string, preferIndexed = false) {
  const key = config.governorContractId
    ? ([
        'governor-settings',
        config.governorContractId,
        config.rpcUrl,
        config.passphrase,
        publicKey ?? '',
        preferIndexed ? config.tokenContractId : ''
      ] as const)
    : null;
  return useSWR(key, fetchGovernorSettings, { keepPreviousData: true });
}

type ContractKind = 'token' | 'governor' | 'auction';
type ContractAdminKey = readonly ['contract-admin', ContractKind, string, string, string, string];

async function fetchContractAdmin([, kind, contractId, rpcUrl, passphrase, publicKey]: ContractAdminKey) {
  const options = { contractId, rpcUrl, networkPassphrase: passphrase, publicKey: readSource(publicKey) };
  const client =
    kind === 'token'
      ? new TokenClient(options)
      : kind === 'governor'
        ? new GovernorClient(options)
        : new AuctionClient(options);

  return (await client.admin()).result;
}

export function useContractAdmin(config: DaoNetworkConfig, kind: ContractKind, publicKey?: string) {
  const contractId =
    kind === 'token'
      ? config.tokenContractId
      : kind === 'governor'
        ? config.governorContractId
        : config.auctionContractId;
  const key = contractId
    ? (['contract-admin', kind, contractId, config.rpcUrl, config.passphrase, publicKey ?? ''] as const)
    : null;

  return useSWR(key, fetchContractAdmin);
}
