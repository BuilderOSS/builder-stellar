import { describe, expect, it } from 'vitest';

import { defaultConfiguration } from '@/stores/create-dao-store';

import { sectionOfKey, unlockedCount, validateSection } from './create-dao-sections';

const keys = (errors: { key: string }[]) => errors.map((error) => error.key).sort();

describe('validateSection', () => {
  it('flags every missing identity field, keyed like its input', () => {
    const state = defaultConfiguration('testnet');
    expect(keys(validateSection('identity', state))).toEqual(['description', 'slug', 'tokenName', 'tokenSymbol']);
  });

  it('passes a filled-in identity', () => {
    const state = defaultConfiguration('testnet');
    Object.assign(state.basicInfo, {
      tokenName: 'Lantern Club',
      tokenSymbol: 'LANTERN',
      slug: 'lantern-club',
      description: 'A club for evening walks.'
    });
    expect(validateSection('identity', state)).toEqual([]);
  });

  it('puts a broken starting price under membership as auction.reservePrice', () => {
    const state = defaultConfiguration('testnet');
    state.auction.reservePrice = 'abc';
    const errors = validateSection('membership', state);
    expect(keys(errors)).toEqual(['auction.reservePrice']);
    expect(sectionOfKey('auction.reservePrice')).toBe('membership');
  });

  it('accepts the default membership and voting choices as they are', () => {
    const state = defaultConfiguration('testnet');
    expect(validateSection('membership', state)).toEqual([]);
    expect(validateSection('voting', state)).toEqual([]);
  });

  it('keys voting errors by field name', () => {
    const state = defaultConfiguration('testnet');
    state.governance.quorumBps = 0;
    expect(keys(validateSection('voting', state))).toEqual(['quorumBps']);
    expect(sectionOfKey('quorumBps')).toBe('voting');
  });
});

describe('unlockedCount', () => {
  it('opens sections up to the saved progress', () => {
    expect(unlockedCount(undefined)).toBe(1);
    expect(unlockedCount('basicInfo')).toBe(1);
    expect(unlockedCount('membership')).toBe(2);
    expect(unlockedCount('governance')).toBe(3);
    expect(unlockedCount('review')).toBe(4);
  });
});
