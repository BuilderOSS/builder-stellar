import { describe, expect, it } from 'vitest';

import { currentSessionPassword, getSessionPasswords } from './secrets';

const A = 'a'.repeat(32);
const B = 'b'.repeat(40);
const env = (IRON_PASSWORD?: string) => ({ IRON_PASSWORD }) as unknown as NodeJS.ProcessEnv;

describe('IRON_PASSWORD', () => {
  it('accepts one secret as secret number 1, the id iron-session gives a plain string', () => {
    expect(getSessionPasswords(env(A))).toEqual({ 1: A });
    expect(currentSessionPassword(env(A))).toBe(A);
  });

  it('accepts a map of numbered secrets and seals with the highest number', () => {
    const map = env(JSON.stringify({ 1: A, 2: B }));
    expect(getSessionPasswords(map)).toEqual({ 1: A, 2: B });
    expect(currentSessionPassword(map)).toBe(B);
    expect(currentSessionPassword(env(JSON.stringify({ 10: A, 9: B })))).toBe(A);
  });

  it.each([
    ['missing', undefined],
    ['short', 'short'],
    ['malformed JSON', `{"1":"${A}"`],
    ['an empty map', '{}'],
    ['an array', `["${A}"]`],
    ['a non-numeric id', JSON.stringify({ current: A })],
    ['a zero id', JSON.stringify({ 0: A })],
    ['a short secret in the map', JSON.stringify({ 1: A, 2: 'short' })],
    ['a non-string secret', JSON.stringify({ 1: 12345 })]
  ])('refuses %s, without quoting the value', (_label, value) => {
    expect(() => getSessionPasswords(env(value))).toThrow(/^IRON_PASSWORD must be/);
    try {
      getSessionPasswords(env(value));
    } catch (error) {
      expect((error as Error).message).not.toContain(A);
    }
  });
});
