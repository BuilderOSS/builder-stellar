import { Address, type FeeBumpTransaction, nativeToScVal, type Transaction, xdr } from '@stellar/stellar-sdk';

import { claimAmount, hashBytes } from './proof';
import type { ClaimAction, PreparedClaim } from './types';

export function claimCallArgs(
  prepared: Pick<PreparedClaim, 'tokenContractId' | 'address' | 'amount'>,
  action: ClaimAction
): xdr.ScVal[] {
  const args = [
    new Address(prepared.tokenContractId).toScVal(),
    new Address(prepared.address).toScVal(),
    nativeToScVal(claimAmount(prepared.amount), { type: 'u128' })
  ];
  if (action.method === 'merkle')
    args.push(xdr.ScVal.scvVec(action.proof.map((hash) => xdr.ScVal.scvBytes(hashBytes(hash)))));
  return args;
}

export function assertClaimEnvelope(
  tx: Transaction | FeeBumpTransaction,
  prepared: PreparedClaim,
  action: ClaimAction,
  now = Math.floor(Date.now() / 1000)
) {
  if (!('source' in tx) || tx.source !== prepared.address) throw new Error('Unexpected transaction source.');
  if (
    prepared.method !== action.method ||
    prepared.round !== action.round ||
    (action.method === 'merkle' && prepared.amount !== action.amount)
  )
    throw new Error('Claim does not match the reviewed round/amount.');
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
    Address.fromScAddress(call.contractAddress).toString() !== prepared.minterContractId ||
    call.functionName.toString() !== `mint_${action.method}`
  )
    throw new Error('Unexpected claim contract or method.');
  const expected = claimCallArgs(prepared, action).map((arg) => arg.toXDR('base64'));
  if (JSON.stringify(call.args.map((arg) => arg.toXDR('base64'))) !== JSON.stringify(expected))
    throw new Error('Claim arguments differ from the review.');
  if (op.auth?.some((entry) => entry.credentials.type !== 'sorobanCredentialsSourceAccount'))
    throw new Error('Additional address authorization is unsupported. Nothing was signed.');
}
