import { describe, expect, it } from 'vitest';

import { WALLET_DECLINED_MESSAGE, walletErrorMessage } from './client';

// BUG-003 (docs/qa/BUG_LEDGER.md): kit modules reject with `{ code, message }`, not Error.
describe('walletErrorMessage', () => {
  it('names a refusal in plain words, whatever the wallet calls it', () => {
    expect(walletErrorMessage({ code: -4, message: 'The user rejected this request.' })).toBe(WALLET_DECLINED_MESSAGE);
    expect(walletErrorMessage({ code: -1, message: 'User declined access' })).toBe(WALLET_DECLINED_MESSAGE);
    expect(walletErrorMessage({ error: { code: -4, message: 'nope' } })).toBe(WALLET_DECLINED_MESSAGE);
    expect(walletErrorMessage(new Error('Request cancelled by user'))).toBe(WALLET_DECLINED_MESSAGE);
  });

  it("keeps a kit-shaped error's own message", () => {
    expect(walletErrorMessage({ code: -1, message: 'Freighter is locked.' })).toBe('Freighter is locked.');
  });

  it("keeps an Error's message", () => {
    expect(walletErrorMessage(new Error('Switch your wallet to Testnet and try again.'))).toBe(
      'Switch your wallet to Testnet and try again.'
    );
  });

  it('falls back when there is nothing to show', () => {
    expect(walletErrorMessage(undefined)).toBe('Wallet sign-in failed.');
    expect(walletErrorMessage({ code: -1, message: '  ' })).toBe('Wallet sign-in failed.');
    expect(walletErrorMessage('boom')).toBe('Wallet sign-in failed.');
  });
});
