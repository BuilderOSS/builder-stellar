'use client';

import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { Server } from '@stellar/stellar-sdk/rpc';
import useSWR from 'swr';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useVoteSource } from '@/lib/vote-source';

export type VotingPowerSnapshot = {
  /** Votes in the vote source's units (divide by 10^decimals to display). */
  votes: bigint;
  snapshotLedger: number;
  /** The vote source's decimal places (0 for the token). */
  decimals: number;
};

type VotingPowerKey = readonly ['voting-power', string, string, string, string, number | 'latest', number];

async function fetchVotingPower([
  ,
  sourceContractId,
  rpcUrl,
  passphrase,
  account,
  ledger,
  decimals
]: VotingPowerKey): Promise<VotingPowerSnapshot> {
  // The token's client calls `get_votes_at_checkpoint(account, ledger)`, which every vote
  // source implements with the same signature (common::clients::VoteSourceApi).
  const token = new TokenClient({
    contractId: sourceContractId,
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
    snapshotLedger,
    decimals
  };
}

/** The account's voting power from the tribe's vote source (its token unless it chose an adapter). */
export function useVotingPower(config: DaoNetworkConfig, account: string, ledger?: number | null) {
  const { voteSource, isLoading, error: sourceError } = useVoteSource(config);
  const key =
    config.tokenContractId && account && voteSource && !isLoading
      ? ([
          'voting-power',
          voteSource.address,
          config.rpcUrl,
          config.passphrase,
          account,
          typeof ledger === 'number' ? ledger : 'latest',
          voteSource.decimals
        ] as const)
      : null;

  const swr = useSWR(key, fetchVotingPower, { keepPreviousData: true });
  // An unreadable vote source is the reader's error too: there is nothing to read votes from.
  return sourceError && !swr.error ? { ...swr, error: sourceError as Error } : swr;
}
