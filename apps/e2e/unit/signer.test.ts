import {
  Account,
  BASE_FEE,
  hash,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { E2E_USER_REJECTED } from '../../web/src/lib/e2e-wallet/protocol.ts';
import { IdentityClaims, type Identity, loadIdentity } from '../src/identities.ts';
import { E2ESigner, SequenceCollisionError } from '../src/wallet/signer.ts';

const identity = (name: string): Identity => {
  const keypair = Keypair.random();
  return { name, address: keypair.publicKey(), keypair };
};

function txFrom(source: string, sequence: string, passphrase = Networks.TESTNET) {
  return new TransactionBuilder(new Account(source, sequence), { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(Operation.bumpSequence({ bumpTo: '0' }))
    .setTimeout(60)
    .build()
    .toXDR();
}

describe('E2ESigner', () => {
  const founder = identity('e2e-founder');
  const member = identity('e2e-member-a');

  it('reports the selected account and testnet', async () => {
    const signer = new E2ESigner([founder, member]);
    signer.use('e2e-member-a');
    expect(await signer.handle({ method: 'getAddress' })).toEqual({ ok: true, result: { address: member.address } });
    expect(await signer.handle({ method: 'getNetwork' })).toMatchObject({
      ok: true,
      result: { networkPassphrase: Networks.TESTNET }
    });
    expect(() => signer.use('nobody')).toThrow(/no identity named nobody/);
  });

  it('signs SEP-53 messages that verify against the address', async () => {
    const signer = new E2ESigner([founder]);
    signer.use('e2e-founder');
    const response = await signer.handle({
      method: 'signMessage',
      message: 'Sign in',
      opts: { address: founder.address }
    });
    if (!response.ok) throw new Error(response.error.message);
    const { signedMessage } = response.result as { signedMessage: string };
    expect(founder.keypair.verifyMessage('Sign in', Buffer.from(signedMessage, 'base64'))).toBe(true);
  });

  it('signs auth entries over the SHA-256 of the preimage (SEP-43)', async () => {
    const signer = new E2ESigner([founder]);
    signer.use('e2e-founder');
    const preimage = Buffer.from('preimage-bytes');
    const response = await signer.handle({ method: 'signAuthEntry', authEntry: preimage.toString('base64') });
    if (!response.ok) throw new Error(response.error.message);
    const signature = Buffer.from((response.result as { signedAuthEntry: string }).signedAuthEntry, 'base64');
    expect(founder.keypair.verify(hash(preimage), signature)).toBe(true);
  });

  it('signs transactions for the selected account', async () => {
    const signer = new E2ESigner([founder]);
    signer.use('e2e-founder');
    const response = await signer.handle({ method: 'signTransaction', xdr: txFrom(founder.address, '10') });
    if (!response.ok) throw new Error(response.error.message);
    const signed = new Transaction((response.result as { signedTxXdr: string }).signedTxXdr, Networks.TESTNET);
    expect(signed.signatures).toHaveLength(1);
    expect(founder.keypair.verify(signed.hash(), signed.signatures[0].signature as unknown as Buffer)).toBe(true);
  });

  it('refuses any network but testnet, and a different account', async () => {
    const signer = new E2ESigner([founder, member]);
    signer.use('e2e-founder');
    const mainnet = await signer.handle({
      method: 'signTransaction',
      xdr: txFrom(founder.address, '1', Networks.PUBLIC),
      opts: { networkPassphrase: Networks.PUBLIC }
    });
    expect(mainnet).toMatchObject({ ok: false, error: { message: expect.stringMatching(/only for testnet/) } });
    const other = await signer.handle({ method: 'signMessage', message: 'x', opts: { address: member.address } });
    expect(other).toMatchObject({ ok: false, error: { message: expect.stringMatching(/is on/) } });
  });

  it('rejects the next call like a user, then signs again', async () => {
    const signer = new E2ESigner([founder]);
    signer.use('e2e-founder');
    signer.rejectNext('signMessage');
    expect(await signer.handle({ method: 'getAddress' })).toMatchObject({ ok: true });
    expect(await signer.handle({ method: 'signMessage', message: 'x' })).toEqual({
      ok: false,
      error: E2E_USER_REJECTED
    });
    expect(await signer.handle({ method: 'signMessage', message: 'x' })).toMatchObject({ ok: true });
    expect(signer.calls.map((call) => call.outcome)).toEqual(['ok', 'rejected', 'ok']);
  });

  it('rejectAll refuses everything but getNetwork until cleared', async () => {
    const signer = new E2ESigner([founder]);
    signer.use('e2e-founder');
    signer.rejectAll();
    expect(await signer.handle({ method: 'getAddress' })).toMatchObject({ ok: false });
    expect(await signer.handle({ method: 'getNetwork' })).toMatchObject({ ok: true });
    signer.clearRejects();
    expect(await signer.handle({ method: 'getAddress' })).toMatchObject({ ok: true });
  });

  it('answers "unsupported" with code -3 for the SEP-10 fallback', async () => {
    const signer = new E2ESigner([founder]);
    signer.use('e2e-founder');
    signer.unsupportedNext('signMessage');
    expect(await signer.handle({ method: 'signMessage', message: 'x' })).toMatchObject({
      ok: false,
      error: { code: -3 }
    });
  });

  it('fails without a selected account', async () => {
    const signer = new E2ESigner([founder]);
    expect(await signer.handle({ method: 'getAddress' })).toMatchObject({ ok: false, error: { code: -1 } });
  });

  describe('per-account lock', () => {
    it('signs the next transaction only after the previous one landed', async () => {
      let onChain = 10n;
      const order: string[] = [];
      const signer = new E2ESigner([founder], {
        accountSequence: async () => onChain,
        pollMs: 5,
        submitWaitMs: 5_000
      });
      signer.use('e2e-founder');
      const first = signer.handle({ method: 'signTransaction', xdr: txFrom(founder.address, '10') }).then((r) => {
        order.push('first');
        return r;
      });
      const second = signer.handle({ method: 'signTransaction', xdr: txFrom(founder.address, '11') }).then((r) => {
        order.push('second');
        return r;
      });
      await first;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(order).toEqual(['first']); // waiting for seq 11 to be used
      onChain = 11n; // the app submitted the first transaction
      expect(await second).toMatchObject({ ok: true });
      expect(order).toEqual(['first', 'second']);
    });

    it('fails fast on a sequence another timeline already used', async () => {
      const signer = new E2ESigner([founder], { accountSequence: async () => 20n });
      signer.use('e2e-founder');
      const response = await signer.handle({ method: 'signTransaction', xdr: txFrom(founder.address, '19') });
      expect(response).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Two timelines/) } });
      expect(new SequenceCollisionError('G', 21n, 21n).name).toBe('SequenceCollisionError');
    });

    it('does not lock transactions from another source (a SEP-10 challenge)', async () => {
      const server = Keypair.random();
      const signer = new E2ESigner([founder], {
        accountSequence: async () => {
          throw new Error('should not read the sequence');
        }
      });
      signer.use('e2e-founder');
      expect(await signer.handle({ method: 'signTransaction', xdr: txFrom(server.publicKey(), '-1') })).toMatchObject({
        ok: true
      });
    });
  });
});

describe('identities', () => {
  it('loads from a key store and refuses a missing key', () => {
    const keypair = Keypair.random();
    const store = {
      address: () => keypair.publicKey(),
      secret: (name: string) => (name === 'a' ? keypair.secret() : null),
      generate: () => undefined
    };
    expect(loadIdentity('a', store).address).toBe(keypair.publicKey());
    expect(() => loadIdentity('b', store)).toThrow(/stellar keys generate b/);
  });

  it('refuses a key whose stored address does not match its secret', () => {
    const store = {
      address: () => Keypair.random().publicKey(),
      secret: () => Keypair.random().secret(),
      generate: () => undefined
    };
    expect(() => loadIdentity('a', store)).toThrow(/different address/);
  });

  it('gives each concurrent timeline its own identity', () => {
    const claims = new IdentityClaims();
    claims.claim('e2e-founder', 'proposal');
    claims.claim('e2e-founder', 'proposal');
    expect(() => claims.claim('e2e-founder', 'auction')).toThrow(/needs its own funded identity/);
    claims.release('proposal');
    expect(() => claims.claim('e2e-founder', 'auction')).not.toThrow();
  });
});
