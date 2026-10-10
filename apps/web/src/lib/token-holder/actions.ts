import { Client as TokenClient } from '@builder-stellar/token-bindings';
import { rpc, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import { z } from 'zod';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { directoryScope } from '@/lib/member-directory/query';
import { holderTokenId, memberAddress } from '@/lib/member-directory/validation';

import { currentTokenHolder, holderBalance, holderDelegate, holderVotes, readHolderValue } from './read';
import type { HolderAction, HolderPrepared } from './types';

export class HolderError extends Error {
  constructor(
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}
const id = z
  .string()
  .max(10)
  .refine((value) => {
    try {
      holderTokenId(value);
      return true;
    } catch {
      return false;
    }
  });
const address = z
  .string()
  .max(56)
  .transform((value, ctx) => {
    try {
      return memberAddress(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid Stellar address.' });
      return z.NEVER;
    }
  });
export const holderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('transfer'), tokenId: id, destination: address }).strict(),
  z.object({ action: z.literal('approve'), tokenId: id, destination: address, expirationLedger: id }).strict(),
  z.object({ action: z.literal('revoke'), tokenId: id }).strict(),
  z.object({ action: z.literal('delegate'), tokenId: id, destination: address }).strict()
]);
export function holderClient(config: DaoNetworkConfig, address: string) {
  return new TokenClient({
    contractId: config.tokenContractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.passphrase,
    publicKey: address,
    allowHttp: config.name === 'local'
  });
}
export async function assertHolderOwner(client: Pick<TokenClient, 'owner_of'>, tokenId: number, address: string) {
  const owner = await currentTokenHolder(client, tokenId);
  if (owner !== address) throw new HolderError('You no longer own this token. Refresh before trying again.', 409);
}
export function holderXdr(tx: AssembledTransaction<void>) {
  void tx.simulationData;
  if (tx.needsNonInvokerSigningBy().some((address) => StrKey.isValidEd25519PublicKey(address)))
    throw new HolderError('This action needs another account signature. Nothing was submitted.');
  return tx.toXdr();
}
export async function prepareHolderAction(
  daoId: string,
  actor: { address: string; network: string },
  action: HolderAction
): Promise<HolderPrepared> {
  const { config, deploymentId, daoId: token } = await directoryScope(daoId);
  const deployment = getDeploymentConfig();
  if (
    actor.network !== config.name ||
    config.name !== deployment.name ||
    config.passphrase !== deployment.networkPassphrase
  )
    throw new HolderError('Authenticate on this DAO’s network before continuing.', 401);
  if (!StrKey.isValidEd25519PublicKey(actor.address))
    throw new HolderError('An authenticated account is required.', 401);
  const tokenId = holderTokenId(action.tokenId);
  const client = holderClient(config, actor.address);
  await assertHolderOwner(client, tokenId, actor.address);
  const options = { timeoutInSeconds: 180 };
  let tx: AssembledTransaction<void>;
  let summary: string;
  if (action.action === 'transfer') {
    if (action.destination === actor.address) throw new HolderError('Choose a different recipient.');
    tx = await client.transfer(
      { from: actor.address, to: memberAddress(action.destination), token_id: tokenId },
      options
    );
    summary = `Transfer token #${tokenId} to ${action.destination}. You will no longer own it. Its voting unit moves to the recipient’s delegate.`;
  } else if (action.action === 'approve') {
    const expiration = holderTokenId(action.expirationLedger);
    const latest = await new rpc.Server(config.rpcUrl, { allowHttp: config.name === 'local' }).getLatestLedger();
    if (expiration <= latest.sequence) throw new HolderError('Approval expiry must be a future ledger.');
    if (action.destination === actor.address) throw new HolderError('Choose a different spender.');
    tx = await client.approve(
      {
        owner: actor.address,
        spender: memberAddress(action.destination),
        token_id: tokenId,
        expiration_ledger: expiration
      },
      options
    );
    summary = `Allow ${action.destination} to transfer only token #${tokenId} until ledger ${expiration}. This replaces its single-token approval; ownership does not change.`;
  } else if (action.action === 'revoke') {
    // The pinned NFT Base removes the single-token approval at expiration ledger 0.
    // No approval getter is exposed by this binding; a valid spender address is still required.
    tx = await client.approve(
      { owner: actor.address, spender: actor.address, token_id: tokenId, expiration_ledger: 0 },
      options
    );
    summary = `Revoke the single-token approval for #${tokenId} immediately. This does not revoke collection-wide operator permissions or transfer ownership.`;
  } else {
    const [balance, votes, delegate] = await Promise.all([
      client.balance({ account: actor.address }).then((tx) => readHolderValue(tx, holderBalance)),
      client.get_votes({ account: actor.address }).then((tx) => readHolderValue(tx, holderVotes)),
      client.get_delegate({ account: actor.address }).then((tx) => readHolderValue(tx, holderDelegate))
    ]);
    tx = await client.delegate({ account: actor.address, delegatee: memberAddress(action.destination) }, options);
    summary = `Delegate the voting units of all ${balance} tokens you own to ${action.destination}. Current delegate: ${delegate ?? 'none'}. Your current voting power is ${votes.toString()} (including votes received). Ownership and received delegations do not change. Self-delegating returns your own voting units to you.`;
  }
  const xdr = holderXdr(tx);
  const envelope = TransactionBuilder.fromXDR(xdr, config.passphrase);
  if (!('source' in envelope) || envelope.source !== actor.address)
    throw new HolderError('Unexpected transaction source.', 503);
  return {
    deploymentId,
    daoId: token,
    address: actor.address,
    tokenContractId: token,
    tokenId,
    networkPassphrase: config.passphrase,
    rpcUrl: config.rpcUrl,
    xdr,
    fee: envelope.fee,
    summary
  };
}
