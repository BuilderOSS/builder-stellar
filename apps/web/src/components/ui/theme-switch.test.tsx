import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeMenu, ThemeSegments } from './theme-switch';

describe('theme switch', () => {
  beforeEach(() => vi.stubGlobal('React', React));

  it('names the current choice on the top-bar control', () => {
    const html = renderToStaticMarkup(<ThemeMenu preference="light" onChange={() => {}} />);
    expect(html).toContain('aria-label="Appearance: Light"');
    // A stable id, so a server-rendered trigger and the browser's menu agree on it.
    expect(html).toContain('id="menu:appearance-menu:trigger"');
  });

  it('keeps every choice named in the icon-only row', () => {
    const html = renderToStaticMarkup(<ThemeSegments id="you-appearance" preference="dark" onChange={() => {}} />);
    expect(html).toContain('aria-label="Appearance"');
    for (const label of ['Dark', 'Light', 'System']) {
      expect(html).toContain(`title="${label}"`);
      expect(html).toContain(`>${label}<`);
    }
  });
});
