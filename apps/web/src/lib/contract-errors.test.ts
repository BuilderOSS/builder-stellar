import { describe, expect, it } from 'vitest';

import { describeContractError, getContractErrorMessage, parseContractErrorCode } from './contract-errors';

describe('contract error mapping', () => {
  it('parses Soroban host error text', () => {
    expect(parseContractErrorCode(new Error('HostError: Error(Contract, #1508)'))).toBe(1508);
    expect(parseContractErrorCode(new Error('something else'))).toBeNull();
  });

  it('maps the shared and per-contract codes', () => {
    expect(getContractErrorMessage(undefined, 9001)).toContain('NotLive');
    expect(getContractErrorMessage('governor', 1508)).toContain('UseTreasuryExecute');
    expect(getContractErrorMessage('governor', 1509)).toContain('20');
    expect(getContractErrorMessage('treasury', 1402)).toContain('UnknownSelfCall');
    expect(getContractErrorMessage('auction', 1224)).toContain('pending refund');
    expect(getContractErrorMessage('auction', 1225)).toContain('86,400');
    expect(getContractErrorMessage('auction', 1223)).toBeDefined();
    expect(getContractErrorMessage('marketplace', 1314)).toContain('paused');
    expect(getContractErrorMessage('marketplace', 1313)).toBeDefined();
    expect(getContractErrorMessage('manager', 1008)).toContain('platform minter');
    expect(getContractErrorMessage('manager', 1121)).toBeDefined();
    expect(getContractErrorMessage('metadata', 15)).toContain('30');
    expect(getContractErrorMessage('metadata', 16)).toBeDefined();
    expect(getContractErrorMessage('metadata', 22)).toBeDefined();
    expect(getContractErrorMessage('minter', 13)).toContain('TokenNotLive');
  });

  it('keys overlapping codes by contract', () => {
    expect(getContractErrorMessage('auction', 1201)).toContain('token id');
    expect(getContractErrorMessage('manager', 1201)).toContain('DAO');
    expect(getContractErrorMessage('minter', 13)).not.toEqual(getContractErrorMessage('metadata', 13));
  });

  it('refuses to guess ambiguous codes without a contract', () => {
    expect(getContractErrorMessage(undefined, 1201)).toBeUndefined();
    expect(describeContractError(new Error('Error(Contract, #1201)'))).toBeUndefined();
    expect(describeContractError(new Error('Error(Contract, #1201)'), 'auction')).toContain('1201');
  });
});
