import { Client as TreasuryClient } from '@builder-stellar/treasury-bindings';
import { Asset, contract, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import type { z } from 'zod';

import { getTreasuryAssets } from '@/lib/assets-config';
import { decimalToStroops, formatStroops } from '@/lib/auction-values';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { marketplaceTransactionXdr } from '@/lib/marketplace/actions';
import { marketplaceReadiness } from '@/lib/marketplace/readiness';

import { TreasuryError, treasuryScope } from './service';
import type { TreasuryPrepared, TreasuryReadiness } from './types';
import { fundingSchema } from './values';

// Standard SAC interface, discovered by the SDK from the selected verified asset spec.
interface SacTransfer {
  transfer(
    args: { from: string; to: string; amount: bigint },
    options?: contract.MethodOptions
  ): Promise<contract.AssembledTransaction<void>>;
}

export async function treasuryReadiness(
  daoId: string,
  actor: { address: string; network: string },
  assetCode: 'XLM' | 'USDC'
): Promise<TreasuryReadiness> {
  const network = getDeploymentConfig();
  if (actor.network !== network.name || !StrKey.isValidEd25519PublicKey(actor.address))
    throw new TreasuryError('Authenticate your account on this deployment network.', 401);
  const scope = await treasuryScope(daoId);
  const asset = getTreasuryAssets(network.name).find((asset) => asset.code === assetCode);
  const assetContractId = asset?.isNative ? Asset.native().contractId(network.networkPassphrase) : asset?.contractId;
  if (!assetContractId) throw new TreasuryError(`${assetCode} funding is not supported on this network.`);
  const account = await marketplaceReadiness(actor.address, network.name, assetContractId);
  return { ...scope, address: actor.address, network: network.name, assetCode, assetContractId, account };
}

export function assertFundingFunds(
  readiness: TreasuryReadiness['account'],
  amount: bigint,
  fee: bigint,
  native: boolean
) {
  if (!readiness.trustline || !readiness.authorized)
    throw new TreasuryError('An authorized asset trustline is required. Add it in your wallet, then refresh.');
  if (BigInt(readiness.nativeAvailable) < fee)
    throw new TreasuryError('Add XLM above your account reserve for the simulated network fee.');
  if (BigInt(readiness.available) < amount + (native ? fee : 0n))
    throw new TreasuryError('Insufficient spendable balance for this amount and network fee.');
}

/** Preparation only: no signer, submission, database mutation, or body-provided identity. */
export async function prepareTreasuryFunding(
  daoId: string,
  actor: { address: string; network: string },
  input: z.infer<typeof fundingSchema>
): Promise<TreasuryPrepared> {
  const request = fundingSchema.parse(input);
  const readiness = await treasuryReadiness(daoId, actor, request.assetCode);
  const network = getDeploymentConfig();
  const amount = decimalToStroops(request.amount)!;
  assertFundingFunds(readiness.account, amount, 0n, request.assetCode === 'XLM');
  const options = {
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    publicKey: actor.address,
    allowHttp: network.name === 'local'
  };
  const treasury = new TreasuryClient({ ...options, contractId: readiness.treasuryContractId });
  if ((await treasury.governor()).result !== readiness.governorContractId)
    throw new TreasuryError('Live treasury governor does not match this community.', 503);
  const sac = await contract.Client.from<SacTransfer>({ ...options, contractId: readiness.assetContractId });
  const assembled = await sac.transfer(
    { from: actor.address, to: readiness.treasuryContractId, amount },
    { timeoutInSeconds: 180 }
  );
  const xdr = marketplaceTransactionXdr(assembled);
  const tx = TransactionBuilder.fromXDR(xdr, network.networkPassphrase);
  if (!('source' in tx) || tx.source !== actor.address) throw new TreasuryError('Unexpected transaction source.', 503);
  const fee = BigInt(tx.fee);
  // Re-read after simulation; reserve and liabilities must be included, not raw balances alone.
  const account = await marketplaceReadiness(actor.address, network.name, readiness.assetContractId);
  assertFundingFunds(account, amount, fee, request.assetCode === 'XLM');
  return {
    ...readiness,
    account,
    amount: formatStroops(amount),
    fee: fee.toString(),
    xdr,
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase
  };
}
