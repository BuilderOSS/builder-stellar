import { Address, nativeToScVal, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

import { marketplaceFee, marketplaceId } from './amount';
import { MarketplaceError } from './query';
import type { MarketplaceListing } from './types';

export const STALE_PURCHASE =
  'The simulated purchase does not match the reviewed listing. Refresh the listing and review it again; nothing was submitted.';

function reject(): never {
  throw new MarketplaceError(STALE_PURCHASE, 409);
}
function sameValue(actual: xdr.ScVal, expected: xdr.ScVal) {
  return actual.toXdr('base64') === expected.toXdr('base64');
}
function callMatches(call: xdr.InvokeContractArgs, contract: string, method: string, args: xdr.ScVal[]) {
  return (
    Address.fromScAddress(call.contractAddress).toString() === contract &&
    call.functionName.toString() === method &&
    call.args.length === args.length &&
    call.args.every((value, index) => sameValue(value, args[index]))
  );
}

/** Inspect actual XDR, not a displayed quote or the SDK's predicted return value.
 * The current contract requires buyer auth on the buy root, and SAC transfer leaves
 * beneath it. Mint / escrow delivery use the marketplace's own contract auth, not
 * buyer auth. Reject every additional buyer permission, even if total spend agrees.
 */
export function assertMarketplacePurchaseAuthorization(
  encoded: string,
  networkPassphrase: string,
  listing: MarketplaceListing,
  buyer: string,
  treasury: string,
  simulatedAuth: xdr.SorobanAuthorizationEntry[]
) {
  try {
    const transaction = TransactionBuilder.fromXDR(encoded, networkPassphrase);
    if (!('source' in transaction) || transaction.source !== buyer || transaction.operations.length !== 1) reject();
    const operation = transaction.operations[0];
    if (
      operation.type !== 'invokeHostFunction' ||
      (operation.source && operation.source !== buyer) ||
      operation.func.type !== 'hostFunctionTypeInvokeContract'
    )
      reject();

    const method = listing.kind === 'primary' ? 'buy_primary' : 'buy';
    const id = marketplaceId(listing.id, listing.kind);
    const rootArgs = [
      listing.kind === 'primary' ? nativeToScVal(id, { type: 'u64' }) : nativeToScVal(Number(id), { type: 'u32' }),
      new Address(buyer).toScVal()
    ];
    if (!callMatches(operation.func.invokeContract, listing.contractId, method, rootArgs)) reject();

    // Exactly one source-account auth tree. Other credentials (including delegates)
    // cannot be treated as the envelope signer's permission in this flow.
    if (
      simulatedAuth.length !== 1 ||
      operation.auth?.length !== 1 ||
      simulatedAuth[0].toXdr('base64') !== operation.auth[0].toXdr('base64')
    )
      reject();
    const entry = operation.auth[0];
    if (entry.credentials.type !== 'sorobanCredentialsSourceAccount') reject();
    const root = entry.rootInvocation;
    if (
      root.function.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
      !callMatches(root.function.contractFn, listing.contractId, method, rootArgs)
    )
      reject();

    const price = BigInt(listing.price);
    if (price <= 0n) reject();
    const payments =
      listing.kind === 'primary'
        ? [{ to: treasury, amount: price }]
        : [
            { to: treasury, amount: marketplaceFee(listing.price, listing.feeBps) },
            { to: listing.seller ?? '', amount: price - marketplaceFee(listing.price, listing.feeBps) }
          ].filter(({ amount }) => amount > 0n); // payment_transfer explicitly skips zero amounts.
    if (root.subInvocations.length !== payments.length) reject();
    for (const [index, payment] of payments.entries()) {
      const child = root.subInvocations[index];
      if (
        child.function.type !== 'sorobanAuthorizedFunctionTypeContractFn' ||
        child.subInvocations.length !== 0 ||
        !callMatches(child.function.contractFn, listing.paymentAsset, 'transfer', [
          new Address(buyer).toScVal(),
          new Address(payment.to).toScVal(),
          nativeToScVal(payment.amount, { type: 'i128' })
        ])
      )
        reject();
    }
  } catch (error) {
    if (error instanceof MarketplaceError) throw error;
    reject(); // Missing, malformed, unknown or unparseable authorization is not a valid quote.
  }
}
