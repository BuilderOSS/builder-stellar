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
 * beneath it. Delivery out of the marketplace's custody uses its own contract auth, not
 * buyer auth. Reject every additional buyer permission, even if total spend agrees.
 * A pool purchase also pins the stock page and token the server picked (`pick`).
 */
export function assertMarketplacePurchaseAuthorization(
  encoded: string,
  networkPassphrase: string,
  listing: MarketplaceListing,
  buyer: string,
  treasury: string,
  simulatedAuth: xdr.SorobanAuthorizationEntry[],
  pick?: { page: number; tokenId: number }
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

    const pool = listing.kind === 'pool';
    if (pool && !pick) reject();
    const method = pool ? 'buy_from_pool' : 'buy';
    const id = Number(marketplaceId(listing.id, listing.kind));
    // max_price: the buyer's bound, which must equal the reviewed price.
    const maxPrice = nativeToScVal(BigInt(listing.price), { type: 'i128' });
    const rootArgs = pool
      ? [
          nativeToScVal(id, { type: 'u32' }),
          nativeToScVal(pick!.page, { type: 'u32' }),
          nativeToScVal(pick!.tokenId, { type: 'u32' }),
          new Address(buyer).toScVal(),
          maxPrice
        ]
      : [nativeToScVal(id, { type: 'u32' }), new Address(buyer).toScVal(), maxPrice];
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
    const payments = pool
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
