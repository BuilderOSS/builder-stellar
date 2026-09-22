'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';

export type VotingPowerSnapshot = {
  votes: bigint;
  snapshotLedger: number;
};

type VotingPowerKey = readonly ['voting-power', string, string, string, string, number | 'latest'];

async function fetchVotingPower([
  ,
  tokenContractId,
  rpcUrl,
  passphrase,
  account,
  ledger
]: VotingPowerKey): Promise<VotingPowerSnapshot> {
  const token = new TokenClient({
    contractId: tokenContractId,
    rpcUrl,
    networkPassphrase: passphrase,
    publicKey: account
  });

  const snapshotLedger =
    ledger === 'latest'
      ? Math.max(
          0,
          (await new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') }).getLatestLedger()).sequence - 1
        )
      : ledger;
  const votes = await token.get_votes_at_checkpoint({ account, ledger: snapshotLedger });

  return {
    votes: votes.result,
    snapshotLedger
  };
}

export function useVotingPower(config: DaoNetworkConfig, account: string, ledger?: number | null) {
  const key =
    config.tokenContractId && account
      ? ([
          'voting-power',
          config.tokenContractId,
          config.rpcUrl,
          config.passphrase,
          account,
          typeof ledger === 'number' ? ledger : 'latest'
        ] as const)
      : null;

  return useSWR(key, fetchVotingPower, { keepPreviousData: true });
}
