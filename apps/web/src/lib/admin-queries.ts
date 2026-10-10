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
};

type GovernorSettingsKey = readonly ['governor-settings', string, string, string, string];

async function fetchGovernorSettings([, contractId, rpcUrl, passphrase, publicKey]: GovernorSettingsKey) {
  if (!contractId) {
    throw new Error('Missing governor contract id in the active network config.');
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
    latestLedger: latestLedger.sequence
  } satisfies GovernorSettings;
}

/** `publicKey` is only a simulation source; reads work without it. */
export function useGovernorSettings(config: DaoNetworkConfig, publicKey?: string) {
  const key = config.governorContractId
    ? (['governor-settings', config.governorContractId, config.rpcUrl, config.passphrase, publicKey ?? ''] as const)
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
