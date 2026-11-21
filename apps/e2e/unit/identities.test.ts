import { describe, expect, it } from 'vitest';

import { timelineKeyName } from '../src/identities.ts';

describe('timelineKeyName', () => {
  it('keeps the shared keys without a timeline', () => {
    expect(timelineKeyName('e2e-founder', '')).toBe('e2e-founder');
  });

  it("maps each wallet role to the timeline's own key", () => {
    expect(timelineKeyName('e2e-founder', 'w07')).toBe('e2e-w07-founder');
    expect(timelineKeyName('e2e-member-b', 'w07')).toBe('e2e-w07-member-b');
  });

  it('leaves non-wallet keys (the app server key) shared', () => {
    expect(timelineKeyName('e2e-web-auth', 'w07')).toBe('e2e-web-auth');
  });

  it('refuses a timeline that would make an odd key name', () => {
    expect(() => timelineKeyName('e2e-founder', 'W07!')).toThrow(/E2E_TIMELINE/);
  });
});
