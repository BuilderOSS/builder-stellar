import { describe, expect, it } from 'vitest';

import { manageSectionAccess } from './manage-access';

const launched = {
  isAdmin: false,
  hasMintAccess: false,
  hasGovernanceAccess: false,
  canProposeAdminActions: true,
  canProposeMint: true,
  canProposeGovernance: true,
  canProposeAuction: true
};

describe('manageSectionAccess', () => {
  it('marks every admin section of a launched tribe as needing a vote (BUG-W09-2)', () => {
    const chips = manageSectionAccess(launched);
    for (const key of ['profile', 'token', 'governance', 'owner', 'auction', 'artwork', 'marketplace'])
      expect(chips[key], key).toBe('vote');
    expect(chips.legal).toBeUndefined();
  });

  it('lets the admin change sections directly, and reads only for a wallet with neither', () => {
    expect(manageSectionAccess({ ...launched, isAdmin: true }).marketplace).toBe('direct');
    const none = Object.fromEntries(Object.keys(launched).map((key) => [key, false])) as typeof launched;
    expect(manageSectionAccess(none).artwork).toBe('read');
  });
});
