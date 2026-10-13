import { Client as ClaimMinterClient } from '@builder-stellar/claim-minter-bindings';
import { type contract, rpc } from '@stellar/stellar-sdk';

import { throwIfRestoreNeeded } from '@/lib/restore-required';

/** The DAO's ClaimMinter (crate `minter`, registry kind `claims`), typed by its generated bindings. */
export function claimMinterClient(options: contract.ClientOptions) {
  return new ClaimMinterClient(options);
}

export type ClaimMinter = ReturnType<typeof claimMinterClient>;

export function assertClaimSimulation(tx: contract.AssembledTransaction<contract.Result<number[]>>) {
  throwIfRestoreNeeded(tx);
  if (!tx.simulation || !rpc.Api.isSimulationSuccess(tx.simulation) || rpc.Api.isSimulationRestore(tx.simulation))
    throw new Error('Claim simulation failed or requires archived state restoration. Nothing was signed.');
  void tx.simulationData;
  const result = tx.result;
  if (!result || typeof result.isOk !== 'function' || !result.isOk())
    throw new Error(
      'The ClaimMinter rejected this claim. Check the list, your allocation, prior claims, the price and the mint allowance.'
    );
  result.unwrap();
}
