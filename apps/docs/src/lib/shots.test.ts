import { describe, expect, it } from 'vitest';

import { assertBox, loadShot, resolveShot, ShotError, type ShotManifest } from './shots';

const manifest: ShotManifest = {
  id: 'create/identity/01',
  appCommit: 'abc1234',
  capturedAt: '2026-11-18T12:00:00Z',
  variants: {
    desktop: { width: 2880, height: 1800, viewport: { width: 1440, height: 900 } },
    mobile: { width: 750, height: 1624, viewport: { width: 375, height: 812 } }
  },
  markers: [
    {
      label: 'the Name field',
      box: { desktop: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }, mobile: { x: 0, y: 0.5, w: 1, h: 0.1 } }
    },
    { n: 4, label: 'the Next button', box: { desktop: { x: 0.8, y: 0.9, w: 0.1, h: 0.05 } } }
  ]
};

describe('screenshot manifests', () => {
  it('resolves both devices with theme sources and numbered markers', () => {
    const shot = resolveShot(manifest.id, manifest, () => true);
    expect(shot.variants.map((variant) => variant.device)).toEqual(['desktop', 'mobile']);
    expect(shot.variants[0].src).toEqual({
      light: '/shots/create/identity/01/desktop-light.webp',
      dark: '/shots/create/identity/01/desktop-dark.webp'
    });
    expect(shot.variants[0].markers.map((marker) => marker.n)).toEqual([1, 4]);
    expect(shot.variants[1].markers.map((marker) => marker.label)).toEqual(['the Name field']);
  });
  it('drops a device unless both theme images exist', () => {
    const shot = resolveShot(manifest.id, manifest, (file) => file !== 'mobile-dark.webp');
    expect(shot.variants.map((variant) => variant.device)).toEqual(['desktop']);
  });
  it('fails on a marker box outside the image', () => {
    expect(() => assertBox('x', { x: 0.9, y: 0, w: 0.2, h: 0.1 }, 'desktop')).toThrow(ShotError);
    expect(() => assertBox('x', { x: 0, y: 0, w: 0, h: 0.1 }, 'mobile')).toThrow(ShotError);
    expect(() => assertBox('x', { x: 0, y: 0, w: 1, h: 1 }, 'mobile')).not.toThrow();
  });
  it('fails when the manifest is filed under another id', () => {
    expect(() => resolveShot('other/id', manifest, () => true)).toThrow(ShotError);
  });
  it('treats an uncaptured shot as missing, and rejects malformed ids', () => {
    expect(loadShot('never/captured')).toBeNull();
    expect(() => loadShot('../etc')).toThrow(ShotError);
  });
  it('reads the committed preview fixture', () => {
    expect(loadShot('_preview/design-catalogue')?.variants).toHaveLength(2);
  });
});
