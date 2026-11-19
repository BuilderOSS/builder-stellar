import { describe, expect, it } from 'vitest';

import { APPROVAL_EXPIRED, marketplaceErrorMessage } from './errors';

describe('marketplace error messages', () => {
  it("maps the token's transfer_from approval failure to a plain message", () => {
    expect(marketplaceErrorMessage(new Error('HostError: Error(Contract, #202)'))).toBe(APPROVAL_EXPIRED);
    expect(APPROVAL_EXPIRED).toBe('Your permission expired. Allow the market again.');
    expect(marketplaceErrorMessage(new Error('Error(Contract, #201)'))).toContain('no longer hold');
  });
  it('does not confuse token codes with the longer contract codes', () => {
    expect(marketplaceErrorMessage(new Error('Error(Contract, #7202)'))).not.toBe(APPROVAL_EXPIRED);
    expect(marketplaceErrorMessage(new Error('Error(Contract, #7709)'))).toContain('resale fee');
  });
});
