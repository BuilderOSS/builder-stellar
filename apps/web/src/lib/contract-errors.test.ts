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
    expect(getContractErrorMessage('manager', 7140)).toContain('assurance');
    expect(getContractErrorMessage('token', 7216)).toContain('locked');
    expect(getContractErrorMessage('marketplace', 7718)).toContain('allowance');
    expect(getContractErrorMessage('manager', 7123)).toContain('link');
    expect(getContractErrorMessage('metadata', 7308)).toContain('30');
    expect(getContractErrorMessage('token', 7205)).toContain('43');
    expect(getContractErrorMessage('minter', 7803)).toContain('43');
    expect(getContractErrorMessage('minter', 7810)).toContain('TokenNotLive');
    expect(getContractErrorMessage('governor', 7516)).toContain('CannotConsume');
    expect(getContractErrorMessage('governor', 7517)).toContain('MintsTooLarge');
    expect(getContractErrorMessage('treasury', 7606)).toContain('CannotConsume');
    expect(getContractErrorMessage('governor', 7518)).toContain('StorageVersionMismatch');
    expect(getContractErrorMessage('treasury', 7607)).toContain('StorageVersionMismatch');
    expect(getContractErrorMessage('token', 7222)).toContain('ModuleHoldsTokens');
    expect(getContractErrorMessage('token', 7224)).toContain('ModuleCustodyClosed');
    expect(getContractErrorMessage('auction', 7419)).toContain('NotStellarAsset');
    expect(getContractErrorMessage('auction', 7420)).toContain('TokenInAuction');
    expect(getContractErrorMessage('marketplace', 7728)).toContain('NotStellarAsset');
    expect(getContractErrorMessage('marketplace', 7729)).toContain('NotPaused');
    for (const [contract, code] of [
      ['manager', 7147],
      ['token', 7223],
      ['metadata', 7320],
      ['auction', 7421],
      ['marketplace', 7730],
      ['minter', 7831]
    ] as const) {
      expect(getContractErrorMessage(contract, code)).toContain('StorageVersionMismatch');
    }
    expect(getContractErrorMessage('manager', 7148)).toContain('DriveCodeNotAllowed');
  });

  it('drops retired codes and words the governor lifecycle codes accurately', () => {
    // Retired in contracts/token/src/error.rs and contracts/auction/src/error.rs; codes are never reused.
    expect(getContractErrorMessage(undefined, 7204)).toBeUndefined();
    expect(getContractErrorMessage(undefined, 7415)).toBeUndefined();
    expect(getContractErrorMessage('manager', 7130)).toContain('UpgradeDelayNotElapsed');
    expect(getContractErrorMessage('manager', 7143)).toContain('UnknownAgentKind');
    expect(getContractErrorMessage('manager', 7146)).toContain('InvalidPaymentAsset');
    // Queue raises 5006 for an already-queued proposal too.
    expect(getContractErrorMessage('governor', 5006)).toContain('already queued');
    expect(getContractErrorMessage('governor', 5009)).toBe(
      'Only the person who made a proposal can cancel it, and only before voting closes.'
    );
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
