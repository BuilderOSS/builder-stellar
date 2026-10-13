import { Account, Contract, nativeToScVal, scValToNative, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { assertClaimActor, assertClaimScope, assertPreparedIdentity, claimQueryKey } from './identity';
import { claimActionSchema } from './service';
import { ALICE, BOB, CLAIMS, config, TOKEN, TREASURY, XLM } from './test-fixtures';
import { assertClaimEnvelope, claimCallArgs } from './transaction';
import type { ClaimAction, PreparedClaim } from './types';

const action: ClaimAction = {
  listId: 2,
  leafAmount: '9007199254740993',
  mintNow: 3,
  proof: ['ab'.repeat(32)],
  maxPrice: '50'
};
const prepared = {
  deploymentId: 'dep-a',
  daoId: TOKEN,
  tokenContractId: TOKEN,
  claimsContractId: CLAIMS,
  address: ALICE,
  networkPassphrase: config.passphrase,
  rpcUrl: config.rpcUrl,
  listId: 2,
  leafAmount: action.leafAmount,
  mintNow: 3,
  maxPrice: '50',
  cost: '150',
  asset: XLM
} as PreparedClaim;

function build(args = claimCallArgs(prepared, action), target = CLAIMS, method = 'claim', twice = false) {
  const builder = new TransactionBuilder(new Account(ALICE, '9007199254740993'), {
    fee: '100',
    networkPassphrase: config.passphrase
  })
    .addOperation(new Contract(target).call(method, ...args))
    .setTimeout(180);
  if (twice) builder.addOperation(new Contract(target).call(method, ...args));
  return builder.build();
}

describe('ClaimMinter claim envelope', () => {
  it('encodes claim(list_id, claimer, leaf_amount, mint_now, proof, max_price) in order', () => {
    const args = claimCallArgs(prepared, action);
    expect(args.map((arg) => arg.type)).toEqual(['scvU32', 'scvAddress', 'scvU128', 'scvU32', 'scvVec', 'scvI128']);
    expect(scValToNative(args[0]!)).toBe(2);
    expect(scValToNative(args[3]!)).toBe(3);
  });

  it('accepts exactly the reviewed call and rejects every swap', () => {
    assertClaimEnvelope(build(), prepared, action);
    const args = claimCallArgs(prepared, action);
    // A u64 where the leaf amount's u128 belongs.
    expect(() =>
      assertClaimEnvelope(
        build([args[0]!, args[1]!, nativeToScVal(9007199254740993n, { type: 'u64' }), ...args.slice(3)]),
        prepared,
        action
      )
    ).toThrow('arguments');
    expect(() => assertClaimEnvelope(build(), { ...prepared, address: BOB }, action)).toThrow('source');
    expect(() => assertClaimEnvelope(build(args, TOKEN), prepared, action)).toThrow('contract');
    expect(() => assertClaimEnvelope(build(args, CLAIMS, 'refund'), prepared, action)).toThrow('method');
    expect(() => assertClaimEnvelope(build(args, CLAIMS, 'claim', true), prepared, action)).toThrow('operations');
    expect(() => assertClaimEnvelope(build(), prepared, { ...action, listId: 3 })).toThrow('list');
    expect(() => assertClaimEnvelope(build(), prepared, { ...action, mintNow: 4 })).toThrow('list');
    // A higher price cap than reviewed is a different claim.
    expect(() => assertClaimEnvelope(build(), prepared, { ...action, maxPrice: '51' })).toThrow('price');
    expect(() => assertClaimEnvelope(build(), prepared, action, Math.floor(Date.now() / 1000) + 181)).toThrow(
      'expired'
    );
  });

  it('takes only the reviewed fields from the client', () => {
    expect(claimActionSchema.parse(action)).toEqual(action);
    for (const change of [
      { mintNow: 0 },
      { mintNow: 44 },
      { maxPrice: '-1' },
      { leafAmount: '0' },
      { proof: ['zz'] },
      { claimer: BOB }
    ])
      expect(() => claimActionSchema.parse({ ...action, ...change })).toThrow();
  });

  it('isolates DAO, deployment, actor, claims module, RPC and network', () => {
    assertClaimScope('dep-a', TOKEN, config);
    expect(() => assertClaimScope('', TOKEN, config)).toThrow();
    expect(() => assertClaimScope('dep-b', TREASURY, config)).toThrow();
    assertClaimActor({ address: ALICE, network: 'testnet' }, config);
    expect(() => assertClaimActor({ address: ALICE, network: 'public' }, config)).toThrow('network');
    expect(() => assertClaimActor({ address: TOKEN, network: 'testnet' }, config)).toThrow();
    assertPreparedIdentity(prepared, config, 'dep-a', ALICE, CLAIMS);
    for (const change of [
      { deploymentId: 'dep-b' },
      { daoId: TREASURY },
      { tokenContractId: TREASURY },
      { claimsContractId: TOKEN },
      { address: BOB },
      { rpcUrl: 'https://attacker' },
      { networkPassphrase: 'public' }
    ])
      expect(() => assertPreparedIdentity({ ...prepared, ...change }, config, 'dep-a', ALICE, CLAIMS)).toThrow();
    expect(claimQueryKey('dep-a', TOKEN, ALICE, 'state')).not.toEqual(claimQueryKey('dep-b', TOKEN, ALICE, 'state'));
    expect(claimQueryKey('dep-a', TOKEN, ALICE, 'state')).not.toEqual(claimQueryKey('dep-a', TOKEN, BOB, 'state'));
  });
});
