import { describe, expect, it } from 'vitest';

import { recipientsOf } from './propose-action-dialog';

const A = `G${'A'.repeat(55)}`;
const B = `G${'B'.repeat(55)}`;
const MARKET = `C${'C'.repeat(55)}`;

describe('recipientsOf', () => {
  it('lists each full payee once, and not a mint allowance’s module', () => {
    expect(
      recipientsOf([
        { type: 'send-treasury-funds', recipient: A },
        { type: 'transfer-dao-token', recipient: B },
        { type: 'send-treasury-funds', recipient: A },
        { type: 'change-mint-allowance', recipient: MARKET },
        { type: 'set-members-only-delegation', recipient: '' }
      ])
    ).toEqual([A, B]);
  });
});
