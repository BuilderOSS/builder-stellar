import { describe, expect, it } from 'vitest';

import { activeNavKey, resolveDaoNav, resolveSlot3 } from './dao-nav';

const base = {
  auctionContractId: '',
  auctionEnabled: null,
  marketplaceContractId: '',
  marketplaceEnabled: null,
  minterContractId: ''
};

const keys = (items: Array<{ key: string }>) => items.map((item) => item.key);

describe('resolveSlot3', () => {
  it('prefers Auction when the community has a live or pending auction', () => {
    expect(resolveSlot3({ ...base, auctionContractId: 'CA', auctionEnabled: true })).toBe('auction');
    expect(resolveSlot3({ ...base, auctionContractId: 'CA', auctionEnabled: null })).toBe('auction');
  });

  it('falls back to Market when auctions are off or absent and the marketplace is on', () => {
    expect(resolveSlot3({ ...base, auctionContractId: 'CA', auctionEnabled: false, marketplaceContractId: 'CM' })).toBe(
      'market'
    );
    expect(resolveSlot3({ ...base, marketplaceContractId: 'CM', marketplaceEnabled: true })).toBe('market');
  });

  it('falls back to Members when neither is available', () => {
    expect(resolveSlot3(base)).toBe('members');
    expect(resolveSlot3({ ...base, marketplaceContractId: 'CM', marketplaceEnabled: false })).toBe('members');
  });
});

describe('resolveDaoNav', () => {
  it('builds tabs, More and rail for a full community', () => {
    const nav = resolveDaoNav(
      'lantern',
      { ...base, auctionContractId: 'CA', auctionEnabled: true, marketplaceContractId: 'CM', minterContractId: 'CN' },
      { canManage: true }
    );
    expect(keys(nav.tabs)).toEqual(['home', 'vote', 'auction', 'treasury']);
    expect(keys(nav.more)).toEqual(['market', 'members', 'claims', 'manage']);
    expect(keys(nav.rail)).toEqual(['home', 'vote', 'auction', 'market', 'treasury', 'members', 'claims']);
    expect(keys(nav.railFooter)).toEqual(['manage']);
    expect(nav.tabs[0]).toMatchObject({ href: '/dao/lantern', exact: true });
  });

  it('keeps a disabled auction reachable in More', () => {
    const nav = resolveDaoNav(
      'd',
      { ...base, auctionContractId: 'CA', auctionEnabled: false, marketplaceContractId: 'CM' },
      { canManage: false }
    );
    expect(nav.slot3).toBe('market');
    expect(keys(nav.more)).toEqual(['auction', 'members']);
  });

  it('hides modules the community does not have and Manage for non-managers', () => {
    const nav = resolveDaoNav('d', base, { canManage: false });
    expect(keys(nav.tabs)).toEqual(['home', 'vote', 'members', 'treasury']);
    expect(nav.more).toEqual([]);
    expect(nav.railFooter).toEqual([]);
    expect(keys(nav.rail)).toEqual(['home', 'vote', 'treasury', 'members']);
  });
});

describe('setup item', () => {
  it('shows Setup only while the community is pending, before Manage', () => {
    const pending = resolveDaoNav('d', { ...base, status: 'pending' }, { canManage: true });
    expect(keys(pending.railFooter)).toEqual(['setup', 'manage']);
    expect(keys(pending.more)[0]).toBe('setup');
    expect(pending.railFooter[0].href).toBe('/dao/d/setup');
    const live = resolveDaoNav('d', { ...base, status: 'operational' }, { canManage: true });
    expect(keys(live.railFooter)).toEqual(['manage']);
    expect(keys(live.more)).not.toContain('setup');
  });
});

describe('activeNavKey', () => {
  const items = [
    { key: 'home', href: '/dao/d', exact: true },
    { key: 'vote', href: '/dao/d/proposals' },
    { key: 'manage', href: '/dao/d/admin' }
  ];

  it('matches exact home only on the home path', () => {
    expect(activeNavKey('/dao/d', items)?.key).toBe('home');
    expect(activeNavKey('/dao/d/token/4', items)).toBeUndefined();
  });

  it('matches nested routes to their section', () => {
    expect(activeNavKey('/dao/d/proposals/12', items)?.key).toBe('vote');
    expect(activeNavKey('/dao/d/admin/governance', items)?.key).toBe('manage');
  });

  it('prefers the longest matching prefix', () => {
    const nested = [...items, { key: 'gov', href: '/dao/d/admin/governance' }];
    expect(activeNavKey('/dao/d/admin/governance', nested)?.key).toBe('gov');
  });
});
