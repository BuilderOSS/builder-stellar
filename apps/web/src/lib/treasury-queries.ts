import { Address, Contract, Networks, scValToNative, TransactionBuilder } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import useSWR from 'swr';

import { getTreasuryAssets } from '@/lib/assets-config';
import type { DaoNetworkConfig } from '@/lib/dao-config';

export type AssetBalance = {
  assetCode: string;
  assetIssuer?: string;
  balance: string;
  isNative: boolean;
};

type BalanceKey = readonly ['treasury-balances', string, string];

async function fetchTreasuryBalances([, treasuryContractId, network]: BalanceKey): Promise<AssetBalance[]> {
  const rpcUrl = network === 'testnet' ? 'https://soroban-testnet.stellar.org' : 'https://soroban-mainnet.stellar.org';

  const server = new Server(rpcUrl);
  const balances: AssetBalance[] = [];

  // Get the treasury assets for this network
  const treasuryAssets = getTreasuryAssets(network as 'testnet' | 'mainnet' | 'local');

  // Convert treasury contract ID to Address for balance queries
  const treasuryAddress = new Address(treasuryContractId);

  // Determine network passphrase
  const networkPassphrase =
    network === 'testnet'
      ? Networks.TESTNET
      : network === 'mainnet'
        ? Networks.PUBLIC
        : 'Standalone Network ; February 2017';

  // Query balance for each asset by invoking the SAC's balance function
  for (const asset of treasuryAssets) {
    if (!asset.contractId) {
      // Skip assets without SAC addresses
      balances.push({
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        balance: '0',
        isNative: !!asset.isNative
      });
      continue;
    }

    try {
      // Create contract instance for the SAC
      const tokenContract = new Contract(asset.contractId);

      // Build the balance function invocation
      const balanceOperation = tokenContract.call('balance', treasuryAddress.toScVal());

      // Simulate the transaction to get the balance
      // Use a dummy source account for simulation
      const dummyAccount = await server
        .getAccount('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF')
        .catch(() => ({
          accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {}
        }));

      const builtTx = new TransactionBuilder(dummyAccount as any, {
        fee: '100',
        networkPassphrase
      })
        .addOperation(balanceOperation)
        .setTimeout(30)
        .build();

      const simulation = await server.simulateTransaction(builtTx);

      if ('result' in simulation && simulation.result) {
        // Parse the balance from the result
        const resultValue = simulation.result?.retval;

        if (resultValue) {
          // Balance is returned as i128, use scValToNative to convert
          const balanceValue = scValToNative(resultValue);

          // Convert to decimal string (assuming 7 decimal places for Stellar assets)
          const balanceStr = typeof balanceValue === 'bigint' ? (Number(balanceValue) / 10_000_000).toFixed(7) : '0';

          balances.push({
            assetCode: asset.code,
            assetIssuer: asset.issuer,
            balance: balanceStr,
            isNative: !!asset.isNative
          });
        } else {
          throw new Error('No result value returned');
        }
      } else {
        console.error(`Failed to get balance for ${asset.code}:`, simulation);
        balances.push({
          assetCode: asset.code,
          assetIssuer: asset.issuer,
          balance: '0',
          isNative: !!asset.isNative
        });
      }
    } catch (error) {
      console.error(`Error fetching balance for ${asset.code}:`, error);
      balances.push({
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        balance: '0',
        isNative: !!asset.isNative
      });
    }
  }

  return balances;
}

export function useTreasuryBalances(config: DaoNetworkConfig) {
  const key = config.treasuryContractId
    ? (['treasury-balances', config.treasuryContractId, config.name] as const)
    : null;

  return useSWR(key, fetchTreasuryBalances, {
    keepPreviousData: true,
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: false
  });
}
