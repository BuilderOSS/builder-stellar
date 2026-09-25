import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { createAuthMessage } from './message';
import { AuthError } from './server';
import { verifyAuthProof } from './verification';

const network = {
  name: 'testnet',
  label: 'Testnet',
  networkPassphrase: 'Test SDF Network ; September 2015'
};

function createFixture() {
  const keypair = Keypair.random();
  const issuedTimestamp = Date.now() - 1000;
  const issuedAt = new Date(issuedTimestamp).toISOString();
  const expiresAt = new Date(issuedTimestamp + 5 * 60 * 1000 - 1000).toISOString();
  const session = {
    challenge: {
      nonce: 'nonce-123',
      issuedAt,
      expiresAt,
      network: 'testnet',
      domain: 'localhost:3000',
      uri: 'http://localhost:3000'
    }
  };
  const message = createAuthMessage({
    appName: 'Stellar DAOs',
    address: keypair.publicKey(),
    domain: 'localhost:3000',
    uri: 'http://localhost:3000',
    network: 'Testnet',
    nonce: session.challenge.nonce,
    issuedAt,
    expirationTime: expiresAt
  });
  const signature = Buffer.from(keypair.signMessage(message)).toString('base64');

  return { keypair, session, message, signature };
}

function verifyFixture(overrides: Partial<Parameters<typeof verifyAuthProof>[0]> = {}) {
  const fixture = createFixture();
  return {
    fixture,
    result: verifyAuthProof({
      address: fixture.keypair.publicKey(),
      message: fixture.message,
      signature: fixture.signature,
      session: fixture.session,
      appName: 'Stellar DAOs',
      network,
      domain: 'localhost:3000',
      uri: 'http://localhost:3000',
      ...overrides
    })
  };
}

describe('verifyAuthProof', () => {
  it('accepts a valid unexpired SEP-53 proof', () => {
    const { result } = verifyFixture();
    expect(result.address).toMatch(/^G/);
    expect(result.network).toBe('testnet');
  });

  it('rejects an invalid signature', () => {
    const fixture = createFixture();
    expect(() =>
      verifyAuthProof({
        address: fixture.keypair.publicKey(),
        message: fixture.message,
        signature: Buffer.from(Keypair.random().signMessage(fixture.message)).toString('base64'),
        session: fixture.session,
        appName: 'Stellar DAOs',
        network,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000'
      })
    ).toThrowError(AuthError);
  });

  it('accepts a hexadecimal SEP-53 signature', () => {
    const fixture = createFixture();
    const hexSignature = Buffer.from(fixture.keypair.signMessage(fixture.message)).toString('hex');
    const result = verifyAuthProof({
      address: fixture.keypair.publicKey(),
      message: fixture.message,
      signature: `0x${hexSignature}`,
      session: fixture.session,
      appName: 'Stellar DAOs',
      network,
      domain: 'localhost:3000',
      uri: 'http://localhost:3000'
    });
    expect(result.address).toBe(fixture.keypair.publicKey());
  });

  it('rejects a signature when the address changes', () => {
    const fixture = createFixture();
    expect(() => verifyFixture({ address: Keypair.random().publicKey(), session: fixture.session })).toThrowError(
      AuthError
    );
  });

  it('rejects the wrong network and origin', () => {
    expect(() => verifyFixture({ network: { ...network, name: 'public', label: 'Mainnet' } })).toThrowError(AuthError);
    expect(() => verifyFixture({ domain: 'evil.example' })).toThrowError(AuthError);
  });

  it('rejects modified messages and expired challenges', () => {
    const fixture = createFixture();
    expect(() => verifyFixture({ message: `${fixture.message} modified` })).toThrowError(AuthError);

    const expiredSession = {
      ...fixture.session,
      challenge: {
        ...fixture.session.challenge,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }
    };
    expect(() => verifyFixture({ session: expiredSession })).toThrowError(AuthError);
  });

  it('rejects a missing or consumed challenge', () => {
    const fixture = createFixture();
    expect(() => verifyFixture({ session: {} })).toThrowError(AuthError);
    expect(() =>
      verifyAuthProof({
        address: fixture.keypair.publicKey(),
        message: fixture.message,
        signature: fixture.signature,
        session: {},
        appName: 'Stellar DAOs',
        network,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000'
      })
    ).toThrowError(AuthError);
  });
});
