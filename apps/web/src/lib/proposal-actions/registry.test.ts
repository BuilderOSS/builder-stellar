import { describe, expect, it } from 'vitest';

import { getActionHandler, getAllActionHandlers } from './registry';
import { PROPOSAL_ACTION_GROUPS } from './types';

describe('action registry', () => {
  it('files every action under a Manage group', () => {
    for (const handler of getAllActionHandlers()) expect(PROPOSAL_ACTION_GROUPS, handler.type).toContain(handler.group);
  });

  it('keeps storage migration and the old single mint out of the picker', () => {
    // Migration fails while every contract is at storage version 1; minting has one form for any number of wallets.
    expect(getActionHandler('migrate-dao-module').pickable).toBe(false);
    expect(getActionHandler('mint-governance-token').pickable).toBe(false);
    expect(
      getAllActionHandlers()
        .filter((handler) => handler.pickable === false)
        .map((handler) => handler.type)
        .sort()
    ).toEqual(['migrate-dao-module', 'mint-governance-token']);
  });
});
