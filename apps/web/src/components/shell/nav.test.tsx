import { House } from 'lucide-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { NavRail, RAIL_COMMUNITY_LIMIT } from './nav';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const items = [{ key: 'home', label: 'Home', href: '/', icon: House }];
const community = (n: number) => ({ key: `C${n}`, label: `Club ${n}`, href: `/dao/club-${n}`, seed: `C${n}` });

describe('NavRail communities', () => {
  it('shows no group when there are no communities', () => {
    expect(renderToStaticMarkup(<NavRail label="Builder" items={items} />)).not.toContain('Yours');
  });

  it('links each community by its route and names it', () => {
    const html = renderToStaticMarkup(
      <NavRail label="Builder" items={items} communities={[community(1), community(2)]} />
    );
    expect(html).toContain('href="/dao/club-1"');
    expect(html).toContain('Club 2');
    expect(html).not.toContain('All your communities');
  });

  it(`caps the list at ${RAIL_COMMUNITY_LIMIT} and links to the rest`, () => {
    const many = Array.from({ length: RAIL_COMMUNITY_LIMIT + 2 }, (_, i) => community(i + 1));
    const html = renderToStaticMarkup(
      <NavRail label="Builder" items={items} communities={many} communitiesHref="/#your-communities" />
    );
    expect(html).toContain(`Club ${RAIL_COMMUNITY_LIMIT}`);
    expect(html).not.toContain(`Club ${RAIL_COMMUNITY_LIMIT + 1}`);
    expect(html).toContain('All your communities');
    expect(html).toContain('href="/#your-communities"');
  });
});
