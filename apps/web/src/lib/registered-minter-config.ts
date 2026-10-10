import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { StrKey } from '@stellar/stellar-sdk';

import type { NetworkConfig } from '@/config/networks';
import { readSource } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { minterClient } from '@/lib/minter/client';
import { cached } from '@/lib/server-cache';

/**
 * Server-only discovery from the canonical Manager, never a submitted address.
 * Cached for 10 minutes: the registration changes only by a Manager admin
 * action, and every claim/allocation flow rechecks it before signing.
 */
export async function registeredMinterConfig(network: NetworkConfig, publicKey: string) {
  const deployment = getDeploymentConfig();
  return cached(`minter:${network.name}:${deployment.managerAddress}`, 10 * 60_000, () =>
    loadRegisteredMinterConfig(network, publicKey)
  );
}

async function loadRegisteredMinterConfig(network: NetworkConfig, publicKey: string) {
  const deployment = getDeploymentConfig();
  if (
    deployment.name !== network.name ||
    deployment.networkPassphrase !== network.networkPassphrase ||
    deployment.rpcUrl !== network.rpcUrl
  )
    throw new Error('Minter registration network mismatch.');
  const options = {
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    publicKey: readSource(publicKey),
    allowHttp: network.name === 'local'
  };
  const registration = await new ManagerClient({
    ...options,
    contractId: deployment.managerAddress
  }).get_platform_minter();
  const address = registration.result;
  if (address === null) return { minterContractId: '', minterSpec: undefined };
  if (!StrKey.isValidContract(address)) throw new Error('Invalid registered platform Minter.');
  const client = await minterClient({ ...options, contractId: address });
  return { minterContractId: address, minterSpec: client.spec.entries.map((entry) => entry.toXDR('base64')) };
}
