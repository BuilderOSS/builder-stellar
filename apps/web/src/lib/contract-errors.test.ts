import { describe, expect, it } from 'vitest';

import {
  contractForErrorCode,
  describeContractError,
  getContractErrorMessage,
  parseContractErrorCode
} from './contract-errors';

describe('contract error mapping', () => {
  it('parses Soroban host error text', () => {
    expect(parseContractErrorCode(new Error('HostError: Error(Contract, #7507)'))).toBe(7507);
    expect(parseContractErrorCode(new Error('something else'))).toBeNull();
  });

  it('maps the shared and per-contract codes', () => {
    expect(getContractErrorMessage(undefined, 7001)).toContain('NotLive');
    expect(getContractErrorMessage('governor', 7507)).toContain('UseTreasuryExecute');
    expect(getContractErrorMessage('governor', 7508)).toContain('20');
    expect(getContractErrorMessage('treasury', 7602)).toContain('UnknownSelfCall');
    expect(getContractErrorMessage('auction', 7416)).toContain('pending refund');
    expect(getContractErrorMessage('auction', 7417)).toContain('86,400');
    expect(getContractErrorMessage('marketplace', 7713)).toContain('paused');
    expect(getContractErrorMessage('marketplace', 7714)).toBeDefined();
    expect(getContractErrorMessage('manager', 7108)).toContain('platform minter');
    expect(getContractErrorMessage('manager', 7123)).toContain('slug');
    expect(getContractErrorMessage('metadata', 7308)).toContain('30');
    expect(getContractErrorMessage('token', 7205)).toContain('43');
    expect(getContractErrorMessage('minter', 7803)).toContain('18');
    expect(getContractErrorMessage('minter', 7810)).toContain('TokenNotLive');
  });

  it('identifies the owning contract from the code alone', () => {
    expect(contractForErrorCode(7001)).toBe('common');
    expect(contractForErrorCode(7123)).toBe('manager');
    expect(contractForErrorCode(7205)).toBe('token');
    expect(contractForErrorCode(7401)).toBe('auction');
    expect(contractForErrorCode(7605)).toBe('treasury');
    expect(contractForErrorCode(5007)).toBeUndefined();
    // Codes are unique, so no contract is needed to describe one.
    expect(describeContractError(new Error('Error(Contract, #7401)'))).toContain('7401');
  });

  it('does not describe a project code against the wrong contract', () => {
    expect(getContractErrorMessage('auction', 7127)).toBeUndefined();
    expect(getContractErrorMessage('auction', 7001)).toContain('NotLive');
    expect(getContractErrorMessage('governor', 5007)).toContain('not queued');
  });
});
