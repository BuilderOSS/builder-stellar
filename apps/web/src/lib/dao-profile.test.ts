import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  EMPTY_PROFILE,
  MAX_PROFILE_BYTES,
  parseProfile,
  profileBytes,
  profileHashHex,
  profileMatchesHash,
  profileProblems,
  serializeProfile
} from './dao-profile';

describe('community profile', () => {
  it('round-trips through the on-chain string with v first and no empty image', () => {
    const profile = {
      description: '# Hi\nWe build.',
      links: [{ label: 'Website', url: 'https://example.com' }],
      image: ''
    };
    const raw = serializeProfile(profile);
    expect(raw).toBe(
      '{"v":1,"description":"# Hi\\nWe build.","links":[{"label":"Website","url":"https://example.com"}]}'
    );
    expect(parseProfile(raw)).toEqual(profile);
    expect(serializeProfile({ ...profile, image: 'ipfs://bafyimg' })).toContain('"image":"ipfs://bafyimg"');
  });

  it('reads tolerantly: unknown fields ignored, missing fields empty, garbage empty', () => {
    expect(parseProfile('{"v":2,"future":true}')).toEqual(EMPTY_PROFILE);
    expect(parseProfile('not json')).toEqual(EMPTY_PROFILE);
    expect(parseProfile('[1,2]')).toEqual(EMPTY_PROFILE);
    expect(parseProfile(null)).toEqual(EMPTY_PROFILE);
  });

  it('drops disallowed schemes, long labels, extra links and unsafe images when reading', () => {
    const raw = JSON.stringify({
      v: 1,
      description: 'd',
      links: [
        { label: 'ok', url: 'https://a.example' },
        { label: 'js', url: 'javascript:alert(1)' },
        { label: 'x'.repeat(33), url: 'https://b.example' },
        { label: 'mail', url: 'mailto:hi@example.com' },
        ...Array.from({ length: 10 }, (_, i) => ({ label: `l${i}`, url: `ipfs://bafy${i}` }))
      ],
      image: 'data:image/png;base64,AAAA'
    });
    const profile = parseProfile(raw);
    expect(profile.links.map((l) => l.label)).toEqual(['ok', 'mail', 'l0', 'l1', 'l2', 'l3', 'l4', 'l5']);
    expect(profile.image).toBe('');
  });

  it('counts labels in code points, not bytes', () => {
    const label = '🙂'.repeat(32);
    expect(parseProfile(JSON.stringify({ links: [{ label, url: 'https://a.example' }] })).links).toHaveLength(1);
  });

  it('validates the serialized byte length and each link for writers', () => {
    expect(profileProblems({ ...EMPTY_PROFILE, description: 'ok' })).toEqual([]);
    const big = { ...EMPTY_PROFILE, description: 'é'.repeat(MAX_PROFILE_BYTES) };
    expect(profileBytes(big)).toBeGreaterThan(MAX_PROFILE_BYTES);
    expect(profileProblems(big)[0]).toMatch(/bytes over/);
    expect(profileProblems({ ...EMPTY_PROFILE, links: [{ label: '', url: 'ftp://x' }] })).toEqual([
      'Link 1 needs a label.',
      'Link 1 must start with https://, http://, mailto: or ipfs://.'
    ]);
  });

  it('hashes exactly like the contract (sha256 of the UTF-8 bytes) and verifies', async () => {
    const raw = serializeProfile({ description: 'Ünïcode ✓', links: [], image: '' });
    const expected = createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex');
    expect(await profileHashHex(raw)).toBe(expected);
    expect(await profileMatchesHash(raw, expected.toUpperCase())).toBe(true);
    expect(await profileMatchesHash(`${raw} `, expected)).toBe(false);
  });
});
