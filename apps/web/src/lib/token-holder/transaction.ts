import { Address, type FeeBumpTransaction, scValToNative, type Transaction } from '@stellar/stellar-sdk';

import type { HolderAction, HolderPrepared } from './types';

export function assertHolderWallet(
  address: string,
  passphrase: string,
  expectedAddress: string,
  expectedPassphrase: string
) {
  if (address !== expectedAddress) throw new Error('Your wallet account changed. Reconnect and authenticate again.');
  if (passphrase !== expectedPassphrase) throw new Error('Switch your wallet to this DAO’s network before signing.');
}
export function assertHolderEnvelope(
  tx: Transaction | FeeBumpTransaction,
  prepared: HolderPrepared,
  action: HolderAction,
  now = Math.floor(Date.now() / 1000)
) {
  if (!('source' in tx) || tx.source !== prepared.address) throw new Error('Unexpected transaction source.');
  if (Number(tx.timeBounds?.maxTime ?? 0) <= now) throw new Error('This review expired. Simulate again.');
  if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction')
    throw new Error('Unexpected transaction operations.');
  const operation = tx.operations[0];
  if (operation.source && operation.source !== prepared.address) throw new Error('Unexpected operation source.');
  if (operation.func.type !== 'hostFunctionTypeInvokeContract') throw new Error('Unexpected host function.');
  const call = operation.func.invokeContract;
  if (Address.fromScAddress(call.contractAddress).toString() !== prepared.tokenContractId)
    throw new Error('Unexpected token contract.');
  const args = call.args.map((value) => scValToNative(value));
  const method = call.functionName.toString();
  const expected =
    action.action === 'transfer'
      ? ['transfer', [prepared.address, action.destination, prepared.tokenId]]
      : action.action === 'delegate'
        ? ['delegate', [prepared.address, action.destination]]
        : [
            'approve',
            [
              prepared.address,
              action.action === 'revoke' ? prepared.address : action.destination,
              prepared.tokenId,
              action.action === 'revoke' ? 0 : Number(action.expirationLedger)
            ]
          ];
  if (method !== expected[0] || JSON.stringify(args) !== JSON.stringify(expected[1]))
    throw new Error('Transaction does not match the reviewed action.');
}
export function assertHolderSignedEnvelope(
  unsigned: Transaction | FeeBumpTransaction,
  signed: Transaction | FeeBumpTransaction
) {
  const hex = (tx: Transaction | FeeBumpTransaction) =>
    Array.from(tx.hash(), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hex(unsigned) !== hex(signed)) throw new Error('The wallet changed the transaction. Nothing was submitted.');
  return hex(signed);
}
