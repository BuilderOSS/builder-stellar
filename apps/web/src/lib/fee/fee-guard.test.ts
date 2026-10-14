import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanDataBuilder,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { assertFeeWithinGuard, FEE_GUARD_STROOPS, FeeGuardError, transactionMaxFee } from './fee-guard';

function txWithResourceFee(resourceFee: bigint) {
  const contractId = Address.contract(Buffer.alloc(32, 3)).toString();
  return new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(new Contract(contractId).call('propose'))
    .setSorobanData(new SorobanDataBuilder().setResourceFee(resourceFee).build())
    .setTimeout(180)
    .build()
    .toXDR();
}

describe('fee guard', () => {
  it('passes everyday fees and refuses one that pays for shared code', () => {
    expect(() => assertFeeWithinGuard(txWithResourceFee(250_000n), Networks.TESTNET)).not.toThrow();
    // Creating a DAO pays ~10 XLM of instance rent on testnet; it must pass.
    expect(() => assertFeeWithinGuard(txWithResourceFee(150_000_000n), Networks.TESTNET)).not.toThrow();
    // The governor.propose fee measured on testnet before the diet (docs/STORAGE_DIET.md D27).
    const xdr = txWithResourceFee(2_998_799_289n);
    expect(transactionMaxFee(xdr, Networks.TESTNET)).toBe(2_998_799_389n);
    expect(() => assertFeeWithinGuard(xdr, Networks.TESTNET)).toThrow(FeeGuardError);
    expect(() => assertFeeWithinGuard(xdr, Networks.TESTNET)).toThrow('about 299.8 XLM');
  });
  it('allows a fee the member was already quoted, and not a cent more', () => {
    const xdr = txWithResourceFee(FEE_GUARD_STROOPS * 3n);
    const fee = transactionMaxFee(xdr)!;
    expect(() => assertFeeWithinGuard(xdr, undefined, fee)).not.toThrow();
    expect(() => assertFeeWithinGuard(xdr, undefined, fee - 1n)).toThrow(FeeGuardError);
  });
  it('leaves anything that is not a transaction to the wallet', () => {
    expect(transactionMaxFee('not xdr')).toBeNull();
    expect(() => assertFeeWithinGuard('not xdr')).not.toThrow();
  });
});
