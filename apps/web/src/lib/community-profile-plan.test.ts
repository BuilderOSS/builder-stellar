import { describe, expect, it } from 'vitest';

import { buildProfilePlan, type CommunityProfile } from './community-profile-plan';
import { parseProfile } from './dao-profile';

const current: CommunityProfile = {
  name: 'Lantern Club',
  symbol: 'LANTERN',
  profile: {
    description: 'Evening walks, shared lanterns.',
    links: [{ label: 'Website', url: 'https://lantern.club' }],
    image: 'https://example.com/a.png'
  }
};
const types = (steps: { type: string }[]) => steps.map((step) => step.type);

describe('buildProfilePlan', () => {
  it('has nothing to do until something changes, ignoring surrounding spaces', () => {
    expect(buildProfilePlan(current, {}, 3)).toEqual([]);
    expect(
      buildProfilePlan(
        current,
        {
          name: ' Lantern Club ',
          profile: { ...current.profile, links: [{ label: 'Website ', url: 'https://lantern.club ' }] }
        },
        3
      )
    ).toEqual([]);
  });

  it('renames name and symbol in one call', () => {
    const [step] = buildProfilePlan(current, { name: 'Lantern Society', symbol: 'LNTN' }, 3);
    expect(step).toMatchObject({
      type: 'set-token-metadata',
      values: { name: 'Lantern Society', symbol: 'LNTN' },
      detail: 'Lantern Club (LANTERN) → Lantern Society (LNTN)'
    });
  });

  it('puts description, links and image in one profile update naming the current revision', () => {
    const steps = buildProfilePlan(
      current,
      {
        symbol: 'LNTN',
        profile: { description: 'New words', links: [], image: 'ipfs://new' }
      },
      3
    );
    expect(types(steps)).toEqual(['set-token-metadata', 'update-dao-profile']);
    const update = steps[1]!;
    expect(update.detail).toBe('New description, links, image');
    if (update.type !== 'update-dao-profile') throw new Error('expected a profile update');
    expect(update.values.expectedSeq).toBe(3);
    expect(parseProfile(update.values.profile)).toEqual({ description: 'New words', links: [], image: 'ipfs://new' });
  });

  it('marks an unknown revision so validation can refuse it', () => {
    const [step] = buildProfilePlan(current, { profile: { ...current.profile, description: 'x' } }, null);
    expect(step?.values).toMatchObject({ expectedSeq: -1 });
  });
});
