import { describe, expect, it } from 'vitest';

import { getProposalActionSummary } from '@/lib/proposal-call';

import { changeMintAllowanceHandler, knownModuleName } from './membership-actions';
import type { FormContext } from './types';

const MARKET = `C${'A'.repeat(55)}`;
const CLAIMS = `C${'B'.repeat(55)}`;
const AUCTION = `C${'D'.repeat(55)}`;
const OTHER = `C${'E'.repeat(55)}`;
const config = { auctionContractId: AUCTION, marketplaceContractId: MARKET, claimsContractId: CLAIMS };

describe('mint allowance names the tribe’s own modules', () => {
  it('names the auction, the market and the claim lists, and nothing else', () => {
    expect(knownModuleName(MARKET, config)).toBe('the market');
    expect(knownModuleName(CLAIMS, config)).toBe('the claim lists');
    expect(knownModuleName(AUCTION, config)).toBe('the auction');
    expect(knownModuleName(OTHER, config)).toBeUndefined();
    expect(knownModuleName('', { marketplaceContractId: '' })).toBeUndefined();
    expect(knownModuleName(MARKET, undefined)).toBeUndefined();
  });

  it('a composed allowance for the market reads "the market", not its contract id', () => {
    const context = { config, session: { address: null, kit: null } } as unknown as FormContext;
    const action = changeMintAllowanceHandler.serialize(
      { module: MARKET, amount: '2', direction: 'increase' },
      context
    );
    expect(getProposalActionSummary(action)).toBe('Raise the mint allowance of the market by 2 tokens');
    const custom = changeMintAllowanceHandler.serialize({ module: OTHER, amount: '2', direction: 'decrease' }, context);
    expect(getProposalActionSummary(custom)).toBe('Lower the mint allowance of CEEE…EEEE by 2 tokens');
  });
});
