import { describe, expect, it } from 'vitest';

import { identiconCells, identityHue, initials } from './identity-hue';

describe('identity helpers', () => {
  it('derives a stable hue per value', () => {
    expect(identityHue('GABC')).toBe(identityHue('GABC'));
    expect(identityHue('GABC')).not.toBe(identityHue('GABD'));
    expect(identityHue('')).toBeGreaterThanOrEqual(0);
  });

  it('builds mirrored 5x5 identicons', () => {
    const cells = identiconCells('GDXYZ');
    expect(cells).toHaveLength(25);
    for (let row = 0; row < 5; row += 1) {
      expect(cells[row * 5]).toBe(cells[row * 5 + 4]);
      expect(cells[row * 5 + 1]).toBe(cells[row * 5 + 3]);
    }
  });

  it('takes up to two initials', () => {
    expect(initials('Lantern Club')).toBe('LC');
    expect(initials('builder')).toBe('BU');
    expect(initials('   ')).toBe('?');
  });
});
