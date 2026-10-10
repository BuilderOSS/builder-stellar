import { describe, expect, it } from 'vitest';

import { followsName, suggestSlug, suggestSymbol } from './create-dao-identity';
import { isValidSlug } from './create-dao-schema';
import { isValidTokenSymbol } from './validation';

describe('suggestSymbol', () => {
  it.each([
    ['Gnars', 'GNARS'],
    ['Builder DAO', 'BUILDER'],
    ['Lantern Club', 'LANTERN'],
    ['Purple Cats Club', 'PCC'],
    ['Café Noir', 'CAFE'],
    ['Supercalifragilistic', 'SUPERCAL'],
    ['DAO 42', 'DAO42'],
    ['!!!', '']
  ])('%s → %s', (name, symbol) => {
    expect(suggestSymbol(name)).toBe(symbol);
    if (symbol) expect(isValidTokenSymbol(symbol)).toBe(true);
  });
});

describe('suggestSlug', () => {
  it.each([
    ['Lantern Club!', 'lantern-club'],
    ['  Builder   DAO ', 'builder-dao'],
    ['Café Noir', 'cafe-noir'],
    ['Gn', 'gn-dao'],
    ['🌙', '']
  ])('%s → %s', (name, slug) => {
    expect(suggestSlug(name)).toBe(slug);
    if (slug) expect(isValidSlug(slug)).toBe(true);
  });

  it('stays within 63 characters without a trailing hyphen', () => {
    const slug = suggestSlug(`${'a'.repeat(62)} b`);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe('followsName', () => {
  it('follows while empty or still the previous suggestion, and stops once edited', () => {
    expect(followsName('', 'Lantern', suggestSlug)).toBe(true);
    expect(followsName('lantern', 'Lantern', suggestSlug)).toBe(true);
    expect(followsName('my-own', 'Lantern', suggestSlug)).toBe(false);
  });
});
