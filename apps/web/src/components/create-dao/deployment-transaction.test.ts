import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultConfiguration } from '@/stores/create-dao-store';

import {
  bindSignedCreationEnvelope,
  creationConfigurationFingerprint,
  storedCreationEnvelope
} from './deployment-transaction';

afterEach(() => vi.useRealTimers());
const actor = Keypair.random();
const make = (value = 'reviewed', fee = '100', sequence = '1') =>
  new TransactionBuilder(new Account(actor.publicKey(), sequence), { fee, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.manageData({ name: 'offline body binding fixture', value }))
    .setTimeout(180)
    .build();
describe('reviewed creation configuration and wallet envelope binding', () => {
  it('allows signature-only changes and preserves the exact signed envelope and finite expiry', () => {
    const original = make();
    const signed = TransactionBuilder.fromXDR(original.toXDR(), Networks.TESTNET);
    signed.sign(actor);
    const bound = bindSignedCreationEnvelope(original.toXDR(), signed.toXDR(), Networks.TESTNET, actor.publicKey());
    expect(bound.signedTxXdr).toBe(signed.toXDR());
    expect(bound.expiresAt).toBe(Number(original.timeBounds!.maxTime));
    expect(storedCreationEnvelope(bound, Networks.TESTNET, actor.publicKey()).toXDR()).toBe(signed.toXDR());
  });
  it.each([
    ['operations', () => make('changed')],
    ['fees', () => make('reviewed', '200')],
    ['sequence', () => make('reviewed', '100', '2')]
  ])('rejects changed %s even if the wallet account did not change', (_label, changed) => {
    const original = make();
    const tx = changed();
    tx.sign(actor);
    expect(() => bindSignedCreationEnvelope(original.toXDR(), tx.toXDR(), Networks.TESTNET, actor.publicKey())).toThrow(
      'wallet changed'
    );
  });
  it('rejects expired requests and mismatched saved expiry/hash/source', () => {
    const original = make();
    const bound = bindSignedCreationEnvelope(original.toXDR(), original.toXDR(), Networks.TESTNET, actor.publicKey());
    expect(() =>
      storedCreationEnvelope({ ...bound, expiresAt: bound.expiresAt + 1 }, Networks.TESTNET, actor.publicKey())
    ).toThrow('does not match');
    expect(() => storedCreationEnvelope({ ...bound, hash: 'different' }, Networks.TESTNET, actor.publicKey())).toThrow(
      'does not match'
    );
    expect(() => storedCreationEnvelope(bound, Networks.TESTNET, Keypair.random().publicKey())).toThrow(
      'does not match'
    );
    vi.useFakeTimers();
    vi.setSystemTime(bound.expiresAt * 1000);
    expect(() =>
      bindSignedCreationEnvelope(original.toXDR(), original.toXDR(), Networks.TESTNET, actor.publicKey())
    ).toThrow('expired');
  });
  it('never manufactures the missing envelope or expiry of an older hash-only receipt', () => {
    expect(() =>
      storedCreationEnvelope({ hash: 'legacy hash', status: 'submitted' }, Networks.TESTNET, actor.publicKey())
    ).toThrow('older receipt');
  });
  it('normalizes exact amounts, text and key order while excluding derived launchAdmin', () => {
    const base = defaultConfiguration();
    base.basicInfo.tokenName = 'Builders';
    base.basicInfo.tokenSymbol = 'BUILD';
    base.basicInfo.slug = 'builders';
    base.basicInfo.description = 'A community of builders.';
    const reviewed = {
      governance: base.governance,
      marketplace: base.marketplace,
      auction: { ...base.auction, reservePrice: '01.0000000' },
      basicInfo: { ...base.basicInfo, tokenName: ' Builders ' },
      launchAdmin: 'derived wallet'
    };
    expect(creationConfigurationFingerprint(reviewed)).toBe(creationConfigurationFingerprint(base));
    expect(creationConfigurationFingerprint({ ...base, auction: { ...base.auction, reservePrice: '2' } })).not.toBe(
      creationConfigurationFingerprint(base)
    );
  });
});
