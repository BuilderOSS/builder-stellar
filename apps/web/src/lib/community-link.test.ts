import { describe, expect, it } from 'vitest';

import { checkNewLink, managerSupportsSlugChange } from './community-link';

describe('checkNewLink', () => {
  it('walks format, sameness, lookup and availability', () => {
    expect(checkNewLink('', 'old-link', 'CDAO', undefined).state).toBe('idle');
    expect(checkNewLink('Bad_Link', 'old-link', 'CDAO', undefined).state).toBe('bad');
    expect(checkNewLink('old-link', 'old-link', 'CDAO', undefined)).toEqual({
      state: 'idle',
      text: 'This is your link now.'
    });
    expect(checkNewLink('new-link', 'old-link', 'CDAO', undefined).state).toBe('checking');
    expect(checkNewLink('new-link', 'old-link', 'CDAO', { valid: true, claimedBy: 'COTHER' }).text).toBe(
      'Another community has this link.'
    );
    expect(checkNewLink('new-link', 'old-link', 'CDAO', { valid: true, message: 'down' }).state).toBe('bad');
    expect(checkNewLink('new-link', 'old-link', 'CDAO', { valid: true, claimedBy: null })).toEqual({
      state: 'ok',
      text: '/dao/new-link is available.'
    });
  });

  it('knows which Manager releases support change_slug', () => {
    expect(managerSupportsSlugChange('0.1.0')).toBe(false);
    expect(managerSupportsSlugChange('0.2.0')).toBe(true);
    expect(managerSupportsSlugChange('1.0.0')).toBe(true);
    expect(managerSupportsSlugChange(undefined)).toBe(false);
  });
});
