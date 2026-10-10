import { StrKey } from '@stellar/stellar-sdk';

import type { DaoNetworkConfig } from '@/lib/dao-config';

import type { PreparedClaim } from './types';

export class ClaimError extends Error {
  constructor(
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}

export function assertClaimActor(actor: { address: string; network: string }, config: DaoNetworkConfig) {
  if (!StrKey.isValidEd25519PublicKey(actor.address) || actor.network !== config.name)
    throw new ClaimError('Authenticate an account on this DAO’s network before claiming.', 401);
}

export function assertClaimScope(deploymentId: string, daoId: string, config: DaoNetworkConfig) {
  if (!deploymentId || !StrKey.isValidContract(daoId) || config.tokenContractId !== daoId)
    throw new ClaimError('DAO identity does not match this deployment.', 503);
}

export function assertPreparedIdentity(
  prepared: PreparedClaim,
  config: DaoNetworkConfig,
  deploymentId: string,
  actor: string,
  minter: string
) {
  if (
    prepared.deploymentId !== deploymentId ||
    prepared.daoId !== config.tokenContractId ||
    prepared.tokenContractId !== config.tokenContractId ||
    prepared.minterContractId !== minter ||
    prepared.address !== actor ||
    prepared.networkPassphrase !== config.passphrase ||
    prepared.rpcUrl !== config.rpcUrl
  )
    throw new Error('Prepared claim does not match this account, DAO, Minter and network.');
}

export function claimQueryKey(deploymentId: string, daoId: string, address: string | null, resource: string, page = 0) {
  return ['minter', deploymentId, daoId, address, resource, page] as const;
}
