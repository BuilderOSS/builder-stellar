import { afterEach, describe, expect, it } from 'vitest';

import { clientAddress, requireVerifiedManager } from '../src/fixtures.ts';

describe('requireVerifiedManager', () => {
  const before = process.env.E2E_MANAGER_STATUS;
  afterEach(() => {
    if (before === undefined) delete process.env.E2E_MANAGER_STATUS;
    else process.env.E2E_MANAGER_STATUS = before;
  });

  it('lets chain flows run only against a verified dev Manager', () => {
    process.env.E2E_MANAGER_STATUS = 'verified';
    expect(() => requireVerifiedManager()).not.toThrow();
    process.env.E2E_MANAGER_STATUS = 'no-manager';
    expect(() => requireVerifiedManager()).toThrow(/status: no-manager/);
    delete process.env.E2E_MANAGER_STATUS;
    expect(() => requireVerifiedManager()).toThrow(/preflight skipped/);
  });
});

describe('clientAddress', () => {
  it('is stable per test and differs between tests', () => {
    expect(clientAddress(0, 'abc')).toBe(clientAddress(0, 'abc'));
    expect(clientAddress(0, 'abc')).not.toBe(clientAddress(0, 'abd'));
    expect(clientAddress(3, 'abc')).toMatch(/^10\.3\.\d{1,3}\.\d{1,3}$/);
  });
});
