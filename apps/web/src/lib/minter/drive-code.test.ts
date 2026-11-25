import { describe, expect, it } from 'vitest';

import { describeDriveCode, driveCodeText } from './drive-code';

const hash = 'ab'.repeat(32);
const record = (patch: Partial<{ name: string; version: string; revoked: boolean }> = {}) => ({
  name: 'ClaimMinter',
  version: '0.6.0',
  revoked: false,
  ...patch
});

describe('the code that holds a drive’s payments', () => {
  it('is current when it is the ClaimMinter create_dao deploys now', () => {
    expect(describeDriveCode({ hash, record: record(), currentClaims: hash, latestClaims: null })).toEqual({
      hash,
      version: '0.6.0',
      standing: 'current'
    });
  });

  it('is latest when it is the announced latest ClaimMinter but not yet current', () => {
    const code = describeDriveCode({ hash, record: record(), currentClaims: 'cd'.repeat(32), latestClaims: hash });
    expect(code?.standing).toBe('latest');
  });

  it('is other, revoked or unregistered otherwise', () => {
    expect(describeDriveCode({ hash, record: record(), currentClaims: null, latestClaims: null })?.standing).toBe(
      'other'
    );
    // A hash registered under another name never counts as the current ClaimMinter.
    expect(
      describeDriveCode({ hash, record: record({ name: 'Token' }), currentClaims: hash, latestClaims: hash })?.standing
    ).toBe('other');
    expect(
      describeDriveCode({ hash, record: record({ revoked: true }), currentClaims: hash, latestClaims: null })?.standing
    ).toBe('revoked');
    expect(describeDriveCode({ hash, record: null, currentClaims: hash, latestClaims: null })?.standing).toBe(
      'unregistered'
    );
  });

  it('is unknown when the instance could not be read', () => {
    expect(describeDriveCode({ hash: null, record: null, currentClaims: null, latestClaims: null })).toBeNull();
    expect(driveCodeText(null, true)).toMatch(/couldn't read which code holds the payments/);
    expect(driveCodeText(undefined, false)).toBe('Checking which code holds the payments.');
  });

  it('names the release in one sentence', () => {
    expect(driveCodeText({ hash, version: '0.6.0', standing: 'latest' }, false)).toBe(
      'Payments are held by ClaimMinter 0.6.0, the claims code the platform announced as its latest release.'
    );
    expect(driveCodeText({ hash, version: null, standing: 'unregistered' }, false)).toBe(
      'Payments are held by code that is not in the platform registry.'
    );
  });
});
