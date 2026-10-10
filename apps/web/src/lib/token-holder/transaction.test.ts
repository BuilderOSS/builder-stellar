import { Account, Contract, Keypair, nativeToScVal, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { assertHolderEnvelope, assertHolderSignedEnvelope, assertHolderWallet } from './transaction';
import type { HolderPrepared } from './types';

describe('explicit holder wallet boundaries', () => {
  const owner = Keypair.random().publicKey();
  const recipient = Keypair.random().publicKey();
  const contract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  const action = { action: 'transfer' as const, tokenId: '0', destination: recipient };
  const prepared: HolderPrepared = {
    deploymentId: 'dep',
    daoId: contract,
    address: owner,
    tokenContractId: contract,
    tokenId: 0,
    networkPassphrase: Networks.TESTNET,
    rpcUrl: 'https://rpc.example',
    xdr: '',
    fee: '100',
    summary: ''
  };
  function envelope(to = recipient, id = 0, contractId = contract) {
    return new TransactionBuilder(new Account(owner, '0'), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(
        new Contract(contractId).call(
          'transfer',
          nativeToScVal(owner, { type: 'address' }),
          nativeToScVal(to, { type: 'address' }),
          nativeToScVal(id, { type: 'u32' })
        )
      )
      .setTimeout(180)
      .build();
  }
  it('requires account and passphrase match', () => {
    expect(() => assertHolderWallet(owner, Networks.TESTNET, owner, Networks.TESTNET)).not.toThrow();
    expect(() => assertHolderWallet(recipient, Networks.TESTNET, owner, Networks.TESTNET)).toThrow('account changed');
    expect(() => assertHolderWallet(owner, Networks.PUBLIC, owner, Networks.TESTNET)).toThrow('network');
  });
  it('checks actual method, destination and token against the review', () => {
    expect(() => assertHolderEnvelope(envelope(), prepared, action)).not.toThrow();
    expect(() => assertHolderEnvelope(envelope(owner), prepared, action)).toThrow('reviewed action');
    expect(() => assertHolderEnvelope(envelope(recipient, 1), prepared, action)).toThrow('reviewed action');
  });
  it('rejects expired reviews before any wallet prompt', () => {
    expect(() => assertHolderEnvelope(envelope(), prepared, action, Number.MAX_SAFE_INTEGER)).toThrow('expired');
  });
  it('rejects wallet-mutated transaction bodies and returns hash for unchanged bodies', () => {
    const unsigned = envelope();
    expect(assertHolderSignedEnvelope(unsigned, unsigned)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertHolderSignedEnvelope(unsigned, envelope(owner))).toThrow('wallet changed');
  });
});
