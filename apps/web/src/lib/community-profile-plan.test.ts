import { describe, expect, it } from 'vitest';

import { buildProfilePlan, type CommunityProfile, tokenReportsRenames } from './community-profile-plan';

const current: CommunityProfile = {
  name: 'Lantern Club',
  symbol: 'LANTERN',
  uri: 'https://example.com/api/dao/x/token/',
  image: 'https://example.com/a.png',
  description: 'Evening walks, shared lanterns.',
  website: 'https://lantern.club'
};
const types = (steps: { type: string }[]) => steps.map((step) => step.type);

describe('buildProfilePlan', () => {
  it('has nothing to do until something changes, ignoring surrounding spaces', () => {
    expect(buildProfilePlan(current, {})).toEqual([]);
    expect(buildProfilePlan(current, { name: ' Lantern Club ', website: 'https://lantern.club ' })).toEqual([]);
  });

  it('renames name and symbol in one call, keeping the token URI', () => {
    const [step] = buildProfilePlan(current, { name: 'Lantern Society', symbol: 'LNTN' });
    expect(step).toMatchObject({
      type: 'set-token-metadata',
      values: { name: 'Lantern Society', symbol: 'LNTN', uri: current.uri },
      detail: 'Lantern Club (LANTERN) → Lantern Society (LNTN)'
    });
  });

  it('orders rename, image, description, website', () => {
    expect(
      types(
        buildProfilePlan(current, {
          website: 'https://lantern.org',
          description: 'New words',
          image: 'ipfs://new',
          symbol: 'LNTN'
        })
      )
    ).toEqual([
      'set-token-metadata',
      'set-artwork-contract-image',
      'set-artwork-description',
      'set-artwork-project-uri'
    ]);
  });
});

describe('tokenReportsRenames', () => {
  it('is true from 0.2.0', () => {
    expect(tokenReportsRenames('0.1.0')).toBe(false);
    expect(tokenReportsRenames('0.2.0')).toBe(true);
    expect(tokenReportsRenames('0.10.1')).toBe(true);
    expect(tokenReportsRenames('1.0.0')).toBe(true);
    expect(tokenReportsRenames(undefined)).toBe(false);
  });
});
