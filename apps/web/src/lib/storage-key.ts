import { xdr } from '@stellar/stellar-sdk';

/** Prefix of every Builder storage key (contracts/common/src/lib.rs `STORAGE_NAMESPACE`). */
export const STORAGE_NAMESPACE = 'buildeross';

/**
 * Encode a Builder storage key: `common::ns(e, Key::Variant(args..))` is the tuple
 * `(Symbol("buildeross"), [Symbol("Variant"), args..])`. OpenZeppelin keys are not
 * namespaced and must not go through this.
 */
export function namespacedKey(variant: string, ...args: xdr.ScVal[]): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol(STORAGE_NAMESPACE),
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...args])
  ]);
}
