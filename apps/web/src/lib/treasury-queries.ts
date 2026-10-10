import { Account, Address, Asset, Contract, scValToNative, TransactionBuilder } from '@stellar/stellar-sdk';
import { Api, Server } from '@stellar/stellar-sdk/rpc';
import useSWR from 'swr';

import { getTreasuryAssets } from '@/lib/assets-config';
import type { DaoNetworkConfig } from '@/lib/dao-config';

export type AssetBalance = {
  assetCode: string;
  assetIssuer?: string;
  /** Exact seven-decimal SAC balance. Failed reads are hook errors, never zero. */
  balance: string;
  isNative: boolean;
};

export type BalanceKey = readonly ['treasury-balances', string, string, DaoNetworkConfig['name'], string, string];

export function formatTreasuryBalance(value: bigint): string {
  if (value < 0n) throw new Error('Invalid negative SAC balance.');
  return `${value / 10_000_000n}.${(value % 10_000_000n).toString().padStart(7, '0')}`;
}

export async function fetchTreasuryBalances([, , treasuryContractId, network, rpcUrl, passphrase]: BalanceKey): Promise<
  AssetBalance[]
> {
  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  return Promise.all(
    getTreasuryAssets(network).map(async (asset) => {
      // Native SAC address derives from the actual network; local is NOT testnet.
      const contractId = asset.isNative ? Asset.native().contractId(passphrase) : asset.contractId;
      if (!contractId) throw new Error(`No SAC configured for ${asset.code} on ${network}.`);
      const builtTx = new TransactionBuilder(
        new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0'),
        {
          fee: '100',
          networkPassphrase: passphrase
        }
      )
        .addOperation(new Contract(contractId).call('balance', new Address(treasuryContractId).toScVal()))
        .setTimeout(30)
        .build();
      const simulation = await server.simulateTransaction(builtTx);
      if (!Api.isSimulationSuccess(simulation) || !simulation.result)
        throw new Error(`Balance unavailable for ${asset.code} on ${network}.`);
      const value = scValToNative(simulation.result.retval);
      if (typeof value !== 'bigint') throw new Error(`Invalid balance result for ${asset.code}.`);
      return {
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        balance: formatTreasuryBalance(value),
        isNative: !!asset.isNative
      };
    })
  );
}

export function treasuryBalanceKey(config: DaoNetworkConfig): BalanceKey | null {
  return config.treasuryContractId
    ? [
        'treasury-balances',
        config.tokenContractId,
        config.treasuryContractId,
        config.name,
        config.rpcUrl,
        config.passphrase
      ]
    : null;
}

export function useTreasuryBalances(config: DaoNetworkConfig) {
  return useSWR(treasuryBalanceKey(config), fetchTreasuryBalances, {
    // Never show a previous DAO/network's balances while changing identities.
    keepPreviousData: false,
    refreshInterval: 30000,
    revalidateOnFocus: true
  });
}
