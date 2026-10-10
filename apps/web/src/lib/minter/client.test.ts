import {
  Account,
  Contract,
  contract,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { assertClaimSimulation, assertMinterSpec } from './client';
import { assertClaimActor, assertClaimScope, assertPreparedIdentity, claimQueryKey } from './identity';
import { buildAllocationDraft, encodeAllocation } from './proposal-actions';
import { ALICE, BOB, config, MINTER, minterSpec, state, TOKEN, TREASURY } from './test-fixtures';
import { assertClaimEnvelope, claimCallArgs } from './transaction';
import type { PreparedClaim } from './types';

describe('Minter exact ABI and identity isolation', () => {
  it('checks ordered signatures, result/error shape and current error codes', () => {
    expect(() => assertMinterSpec(minterSpec())).not.toThrow();
    expect(() => assertMinterSpec(minterSpec({ amountType: xdr.ScSpecTypeDef.scSpecTypeU64() }))).toThrow('ABI');
    expect(() => assertMinterSpec(minterSpec({ output: xdr.ScSpecTypeDef.scSpecTypeVoid() }))).toThrow('ABI');
    expect(() => assertMinterSpec(minterSpec({ liveError: 12 }))).toThrow('error ABI');
  });
  it('encodes bigint u128, token/recipient addresses and Vec<BytesN<32>> via the spec', () => {
    const prepared = { tokenContractId: TOKEN, address: ALICE, amount: '9007199254740993' };
    const action = { method: 'merkle' as const, round: 2, amount: prepared.amount, proof: ['ab'.repeat(32)] };
    const args = minterSpec().funcArgsToScVals('mint_merkle', {
      token_id: TOKEN,
      recipient: ALICE,
      amount: BigInt(action.amount),
      proof: [Buffer.from(action.proof[0], 'hex')]
    });
    expect(args.map((val) => val.toXDR('hex'))).toEqual(claimCallArgs(prepared, action).map((val) => val.toXDR('hex')));
    expect(args[2].type).toBe('scvU128');
    expect(scValToNative(args[2])).toBe(9007199254740993n);
    const allocation = encodeAllocation(
      minterSpec(),
      { type: 'set-allowlist', addresses: [ALICE, BOB], amount: prepared.amount },
      TOKEN
    );
    expect(allocation.map(scValToNative)).toEqual([TOKEN, [ALICE, BOB], 9007199254740993n]);
    const batch = encodeAllocation(
      minterSpec(),
      { type: 'minter-batch-mint', recipients: [ALICE], amounts: ['43'] },
      TOKEN
    );
    expect(batch.map(scValToNative)).toEqual([TOKEN, [ALICE], [43n]]);
    expect(encodeAllocation(minterSpec(), { type: 'set-merkle-root', root: 'ab'.repeat(32) }, TOKEN)[1].type).toBe(
      'scvBytes'
    );
  });
  it('does not equate a fulfilled promise with simulation/Result success', () => {
    const tx = {
      simulation: { transactionData: {}, result: {}, minResourceFee: '1' },
      simulationData: {},
      result: new contract.Ok(null)
    };
    expect(() =>
      assertClaimSimulation(tx as unknown as contract.AssembledTransaction<contract.Result<null>>)
    ).not.toThrow();
    for (const simulation of [
      undefined,
      { error: 'Error(Contract, #8)' },
      { ...tx.simulation, restorePreamble: { transactionData: {} } }
    ])
      expect(() =>
        assertClaimSimulation({ ...tx, simulation } as unknown as contract.AssembledTransaction<contract.Result<null>>)
      ).toThrow();
    expect(() =>
      assertClaimSimulation({
        ...tx,
        result: new contract.Err({ message: 'AlreadyClaimed' })
      } as unknown as contract.AssembledTransaction<contract.Result<null>>)
    ).toThrow('rejected');
  });
  it('isolates DAO, deployment, actor, current Minter, RPC and network', () => {
    assertClaimScope('dep-a', TOKEN, config);
    expect(() => assertClaimScope('', TOKEN, config)).toThrow();
    expect(() => assertClaimScope('dep-b', TREASURY, config)).toThrow();
    assertClaimActor({ address: ALICE, network: 'testnet' }, config);
    expect(() => assertClaimActor({ address: ALICE, network: 'public' }, config)).toThrow('network');
    expect(() => assertClaimActor({ address: TOKEN, network: 'testnet' }, config)).toThrow();
    const p = {
      deploymentId: 'dep-a',
      daoId: TOKEN,
      tokenContractId: TOKEN,
      minterContractId: MINTER,
      address: ALICE,
      networkPassphrase: config.passphrase,
      rpcUrl: config.rpcUrl
    } as PreparedClaim;
    assertPreparedIdentity(p, config, 'dep-a', ALICE, MINTER);
    for (const change of [
      { deploymentId: 'dep-b' },
      { daoId: TREASURY },
      { tokenContractId: TREASURY },
      { minterContractId: TOKEN },
      { address: BOB },
      { rpcUrl: 'https://attacker' },
      { networkPassphrase: 'public' }
    ])
      expect(() => assertPreparedIdentity({ ...p, ...change }, config, 'dep-a', ALICE, MINTER)).toThrow();
    expect(claimQueryKey('dep-a', TOKEN, ALICE, 'state')).not.toEqual(claimQueryKey('dep-b', TOKEN, ALICE, 'state'));
    expect(claimQueryKey('dep-a', TOKEN, ALICE, 'state')).not.toEqual(claimQueryKey('dep-a', TREASURY, ALICE, 'state'));
    expect(claimQueryKey('dep-a', TOKEN, ALICE, 'state')).not.toEqual(claimQueryKey('dep-a', TOKEN, BOB, 'state'));
  });
  it('builds scoped governance allocation descriptors and rejects setup/foreign/owner/authority input', () => {
    const draft = { type: 'set-allowlist' as const, addresses: [ALICE], amount: '5' };
    expect(buildAllocationDraft(draft, state, 'deployment-a', TOKEN, TREASURY)).toMatchObject({
      target: MINTER,
      function: 'set_allowlist',
      args: [TOKEN, [ALICE], '5'],
      submissionEnabled: true
    });
    for (const change of [
      { live: false },
      { mintAuthority: false },
      { admin: ALICE },
      { deploymentId: 'dep-b' },
      { daoId: TREASURY },
      { tokenContractId: TREASURY }
    ])
      expect(() => buildAllocationDraft(draft, { ...state, ...change }, 'deployment-a', TOKEN, TREASURY)).toThrow();
    expect(() => encodeAllocation(minterSpec(), { ...draft, addresses: [ALICE, ALICE] }, TOKEN)).toThrow('Duplicate');
    expect(() =>
      encodeAllocation(minterSpec(), { type: 'minter-batch-mint', recipients: [ALICE], amounts: [] }, TOKEN)
    ).toThrow('lengths');
  });
  it('validates the actual envelope, rejecting swapped token/recipient/u64/operations/time bounds', () => {
    const action = { method: 'allowlist' as const, round: 3 };
    const p = {
      tokenContractId: TOKEN,
      minterContractId: MINTER,
      address: ALICE,
      amount: '9007199254740993',
      method: action.method,
      round: 3
    } as PreparedClaim;
    const build = (args = claimCallArgs(p, action), target = MINTER, feeBump = false) => {
      const builder = new TransactionBuilder(new Account(ALICE, '9007199254740993'), {
        fee: '100',
        networkPassphrase: config.passphrase
      })
        .addOperation(new Contract(target).call('mint_allowlist', ...args))
        .setTimeout(180);
      if (feeBump) builder.addOperation(new Contract(target).call('mint_allowlist', ...args));
      return builder.build();
    };
    assertClaimEnvelope(build(), p, action);
    expect(build().sequence).toBe('9007199254740994');
    const args = claimCallArgs(p, action);
    expect(() =>
      assertClaimEnvelope(build([args[0], args[1], nativeToScVal(9007199254740993n, { type: 'u64' })]), p, action)
    ).toThrow('arguments');
    expect(() => assertClaimEnvelope(build(), { ...p, address: BOB }, action)).toThrow('source');
    expect(() => assertClaimEnvelope(build(), { ...p, tokenContractId: TREASURY }, action)).toThrow('arguments');
    expect(() => assertClaimEnvelope(build(args, TOKEN), p, action)).toThrow('contract');
    expect(() => assertClaimEnvelope(build(args, MINTER, true), p, action)).toThrow('operations');
    expect(() => assertClaimEnvelope(build(), p, { ...action, round: 4 })).toThrow('round');
    expect(() => assertClaimEnvelope(build(), p, action, Math.floor(Date.now() / 1000) + 181)).toThrow('expired');
  });
});
