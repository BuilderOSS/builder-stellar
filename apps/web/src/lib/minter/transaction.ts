import { Address, type FeeBumpTransaction, nativeToScVal, type Transaction, xdr } from '@stellar/stellar-sdk';

import { claimAmount, hashBytes } from './proof';
import type { ClaimAction, PreparedClaim } from './types';

/** `claim(list_id, claimer, leaf_amount, mint_now, proof, max_price)` as the ClaimMinter receives it. */
export function claimCallArgs(prepared: Pick<PreparedClaim, 'address'>, action: ClaimAction): xdr.ScVal[] {
  return [
    xdr.ScVal.scvU32(action.listId),
    new Address(prepared.address).toScVal(),
    nativeToScVal(claimAmount(action.leafAmount), { type: 'u128' }),
    xdr.ScVal.scvU32(action.mintNow),
    xdr.ScVal.scvVec(action.proof.map((hash) => xdr.ScVal.scvBytes(hashBytes(hash)))),
    nativeToScVal(BigInt(action.maxPrice), { type: 'i128' })
  ];
}

/**
 * The signed envelope must be exactly the reviewed call: one invocation of the DAO's
 * ClaimMinter `claim` with the reviewed list, allocation, mint count, proof and price cap,
 * from the claimer, authorized by the source account alone (which covers the payment it
 * makes to the Treasury or escrow).
 */
export function assertClaimEnvelope(
  tx: Transaction | FeeBumpTransaction,
  prepared: PreparedClaim,
  action: ClaimAction,
  now = Math.floor(Date.now() / 1000)
) {
  if (!('source' in tx) || tx.source !== prepared.address) throw new Error('Unexpected transaction source.');
  if (
    prepared.listId !== action.listId ||
    prepared.leafAmount !== action.leafAmount ||
    prepared.mintNow !== action.mintNow ||
    prepared.maxPrice !== action.maxPrice
  )
    throw new Error('Claim does not match the reviewed list, allocation or price.');
  const maxTime = BigInt(tx.timeBounds?.maxTime ?? '0');
  if (maxTime <= BigInt(now) || maxTime > BigInt(now + 180))
    throw new Error('Claim review expired or has unexpected time bounds. Simulate again.');
  if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction')
    throw new Error('Unexpected transaction operations.');
  const op = tx.operations[0];
  if (op.source && op.source !== prepared.address) throw new Error('Unexpected operation source.');
  if (op.func.type !== 'hostFunctionTypeInvokeContract') throw new Error('Unexpected host function.');
  const call = op.func.invokeContract;
  if (
    Address.fromScAddress(call.contractAddress).toString() !== prepared.claimsContractId ||
    call.functionName.toString() !== 'claim'
  )
    throw new Error('Unexpected claim contract or method.');
  const expected = claimCallArgs(prepared, action).map((arg) => arg.toXDR('base64'));
  if (JSON.stringify(call.args.map((arg) => arg.toXDR('base64'))) !== JSON.stringify(expected))
    throw new Error('Claim arguments differ from the review.');
  if (op.auth?.some((entry) => entry.credentials.type !== 'sorobanCredentialsSourceAccount'))
    throw new Error('Additional address authorization is unsupported. Nothing was signed.');
}
