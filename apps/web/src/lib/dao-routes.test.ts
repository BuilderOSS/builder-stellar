import { describe, expect, it } from 'vitest';

import { canonicalDaoUrl, daoRouteId } from './dao-routes';

const ADDRESS = `C${'A'.repeat(55)}`;

describe('daoRouteId', () => {
  it('uses the claimed slug once launched, the address otherwise', () => {
    expect(daoRouteId({ daoId: ADDRESS, slug: 'lantern-club' })).toBe('lantern-club');
    expect(daoRouteId({ daoId: ADDRESS, slug: null })).toBe(ADDRESS);
    expect(daoRouteId({ daoId: ADDRESS })).toBe(ADDRESS);
  });
});

describe('canonicalDaoUrl', () => {
  it('swaps the address for the slug and keeps path, query and hash', () => {
    expect(
      canonicalDaoUrl(
        { pathname: `/dao/${ADDRESS}/proposals/3`, search: '?tab=votes', hash: '#reason' },
        'lantern-club'
      )
    ).toBe('/dao/lantern-club/proposals/3?tab=votes#reason');
  });

  it('returns null when the URL is already canonical or not a DAO page', () => {
    expect(canonicalDaoUrl({ pathname: '/dao/lantern-club/treasury' }, 'lantern-club')).toBeNull();
    expect(canonicalDaoUrl({ pathname: '/discover' }, 'lantern-club')).toBeNull();
  });

  it('sends a requested (unclaimed) slug back to the address', () => {
    expect(canonicalDaoUrl({ pathname: '/dao/maybe-mine' }, ADDRESS)).toBe(`/dao/${ADDRESS}`);
  });
});
