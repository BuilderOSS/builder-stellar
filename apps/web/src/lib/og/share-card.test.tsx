import React from 'react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { shareCard, shareCardOr } from './share-card';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const PNG = [0x89, 0x50, 0x4e, 0x47];
const MAX_BYTES = 300_000;

async function bytes(response: Response) {
  return new Uint8Array(await response.arrayBuffer());
}

describe('share cards', () => {
  it('draws a card as a PNG small enough for WhatsApp', async () => {
    const response = await shareCard({
      title: 'Fund the winter tool library',
      subtitle: 'Lantern Club · Proposal 12',
      chips: [{ label: 'Voting', tone: 'live' }],
      tally: { for: 12, against: 3, abstain: 1 },
      badge: { name: 'Lantern Club', seed: 'C1' }
    });
    const body = await bytes(response);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect([...body.slice(0, 4)]).toEqual(PNG);
    expect(body.byteLength).toBeLessThan(MAX_BYTES);
  });

  it('falls back to the brand card when the data fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await shareCardOr(() => Promise.reject(new Error('Tribe not found')), { section: 'Proposal' });
    expect(response.headers.get('X-Share-Card')).toBe('fallback');
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
    expect([...(await bytes(response)).slice(0, 4)]).toEqual(PNG);
  });

  it('caches a card for its own refresh window', async () => {
    const response = await shareCardOr(async () => ({ title: 'Voting now', maxAge: 300 }), { maxAge: 3600 });
    expect(response.headers.get('X-Share-Card')).toBeNull();
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=300');
  });

  it('falls back when the data takes too long', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await shareCardOr(() => new Promise(() => {}), { timeoutMs: 20 });
    expect(response.headers.get('X-Share-Card')).toBe('fallback');
  });
});
