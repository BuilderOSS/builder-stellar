import { nativeToScVal, StrKey, xdr } from '@stellar/stellar-sdk';

/**
 * Treasury `authorize` actions attach a nested authorization tree to the NEXT
 * proposal action (contracts/treasury: `AuthNode { contract, fn_name, args, sub }`,
 * at most depth 4 and 16 nodes). `AuthNode.args` is `Vec<Val>`, so every argument
 * carries an explicit type; nothing is inferred from a bare string or number.
 */
export const AUTH_MAX_DEPTH = 4;
export const AUTH_MAX_NODES = 16;

export type AuthArgType = 'address' | 'i128' | 'u128' | 'u32' | 'u64' | 'symbol' | 'string' | 'bool';
export type TypedAuthArg = { type: AuthArgType; value: string | boolean };
export type AuthNodeDraft = { contract: string; fnName: string; args: TypedAuthArg[]; sub: AuthNodeDraft[] };

const ARG_TYPES = new Set<AuthArgType>(['address', 'i128', 'u128', 'u32', 'u64', 'symbol', 'string', 'bool']);

export function isTypedAuthArg(value: unknown): value is TypedAuthArg {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ARG_TYPES.has((value as TypedAuthArg).type) &&
    ['string', 'boolean'].includes(typeof (value as TypedAuthArg).value)
  );
}

export function typedAuthArgToScVal(arg: TypedAuthArg): xdr.ScVal {
  switch (arg.type) {
    case 'address': {
      const value = String(arg.value);
      if (!StrKey.isValidEd25519PublicKey(value) && !StrKey.isValidContract(value))
        throw new Error('Invalid address in authorization argument.');
      return nativeToScVal(value, { type: 'address' });
    }
    case 'bool':
      if (typeof arg.value !== 'boolean') throw new Error('Expected a boolean authorization argument.');
      return nativeToScVal(arg.value, { type: 'bool' });
    case 'symbol':
    case 'string':
      return nativeToScVal(String(arg.value), { type: arg.type });
    default: {
      if (!/^-?\d+$/.test(String(arg.value))) throw new Error('Expected a whole-number authorization argument.');
      const value = BigInt(String(arg.value));
      if (arg.type !== 'i128' && value < 0n) throw new Error('Unsigned authorization argument is negative.');
      return arg.type === 'u32'
        ? nativeToScVal(Number(value), { type: 'u32' })
        : nativeToScVal(value, { type: arg.type });
    }
  }
}

/** Fail closed on shape, depth and size before anything is encoded. */
export function validateAuthNodes(nodes: AuthNodeDraft[]): string | null {
  if (!Array.isArray(nodes) || nodes.length === 0) return 'Add at least one authorization node.';
  let count = 0;
  const walk = (list: AuthNodeDraft[], depth: number): string | null => {
    if (depth > AUTH_MAX_DEPTH) return `Authorization trees are at most ${AUTH_MAX_DEPTH} levels deep.`;
    for (const node of list) {
      count += 1;
      if (count > AUTH_MAX_NODES) return `Authorization trees have at most ${AUTH_MAX_NODES} nodes.`;
      if (!node || !StrKey.isValidContract(node.contract)) return 'Each authorization node needs a contract address.';
      if (!/^[A-Za-z0-9_]{1,32}$/.test(node.fnName)) return 'Each authorization node needs a function name.';
      if (!Array.isArray(node.args) || node.args.some((arg) => !isTypedAuthArg(arg)))
        return 'Authorization arguments need an explicit type.';
      try {
        node.args.forEach(typedAuthArgToScVal);
      } catch (error) {
        return (error as Error).message;
      }
      const nested = walk(node.sub ?? [], depth + 1);
      if (nested) return nested;
    }
    return null;
  };
  return walk(nodes, 1);
}

/** The `AuthNode` struct value for spec encoding (args become ScVals). */
export function authNodeSpecValue(node: AuthNodeDraft): Record<string, unknown> {
  return {
    contract: node.contract,
    fn_name: node.fnName,
    args: node.args.map((arg) => typedAuthArgToScVal(arg)),
    sub: (node.sub ?? []).map(authNodeSpecValue)
  };
}

export function describeAuthNodes(nodes: AuthNodeDraft[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    `${'  '.repeat(depth)}${node.contract}.${node.fnName}(${node.args.map((arg) => `${arg.type}:${String(arg.value)}`).join(', ')})`,
    ...describeAuthNodes(node.sub ?? [], depth + 1)
  ]);
}

/**
 * The SAC transfers the Treasury must authorize when a proposal buys a
 * secondary listing (`marketplace.buy(token_id, treasury, max_price)`): the fee
 * to the Treasury and the proceeds to the seller. Zero-amount transfers are not
 * made by the Marketplace, so they are not authorized either.
 */
export function treasuryPurchaseAuthNodes({
  treasury,
  paymentAsset,
  seller,
  price,
  fee
}: {
  treasury: string;
  paymentAsset: string;
  seller: string;
  price: bigint;
  fee: bigint;
}): AuthNodeDraft[] {
  const transfer = (to: string, amount: bigint): AuthNodeDraft => ({
    contract: paymentAsset,
    fnName: 'transfer',
    args: [
      { type: 'address', value: treasury },
      { type: 'address', value: to },
      { type: 'i128', value: amount.toString() }
    ],
    sub: []
  });
  return [...(fee > 0n ? [transfer(treasury, fee)] : []), ...(price - fee > 0n ? [transfer(seller, price - fee)] : [])];
}
