import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./add-module-sheet', () => ({ AddModuleSheet: () => null }));
vi.mock('./remove-module-sheet', () => ({ RemoveModuleSheet: () => null }));
vi.mock('./allowance-sheet', () => ({ AllowanceSheet: () => null }));
vi.stubGlobal('React', React);

import type { DaoNetworkConfig } from '@/lib/dao-config';

import { type ModuleRowData, ModulesCard } from './modules-card';

const market: ModuleRowData = {
  kind: 'marketplace',
  vouched: true,
  address: `C${'M'.repeat(55)}`,
  nonVoting: true,
  allowance: 0,
  agent: false,
  votes: 0n
};
const claims: ModuleRowData = {
  ...market,
  kind: 'claims',
  address: `C${'L'.repeat(55)}`,
  nonVoting: false,
  agent: true
};
const auction: ModuleRowData = { ...market, kind: 'auction', address: `C${'A'.repeat(55)}`, allowance: 0xffffffff };
const config = (over: Partial<DaoNetworkConfig> = {}) =>
  ({ name: 'testnet', auctionPaused: false, marketplaceEnabled: true, ...over }) as DaoNetworkConfig;

function render(props: Partial<React.ComponentProps<typeof ModulesCard>> = {}) {
  return renderToStaticMarkup(
    <ModulesCard
      config={config()}
      daoId="CDAO"
      address="GADDR"
      modules={[market, claims]}
      live
      canAct
      frozen={false}
      busy={false}
      message={null}
      propose={vi.fn()}
      onMessage={vi.fn()}
      onChanged={vi.fn()}
      onChangeAllowance={() => null}
      onProposeOpen={vi.fn()}
      {...props}
    />
  );
}

describe('ModulesCard', () => {
  it('lists each module by its name with its allowance and a way to add another', () => {
    const html = render({ modules: [auction, market, claims] });
    expect(html).toContain('Add a module');
    expect(html).toContain('>Auction contract<');
    expect(html).toContain('>Market contract<');
    expect(html).toContain('>Claims<');
    expect(html).toContain('No limit');
    expect(html).toContain('0 to mint');
    expect(html).toContain('Can move memberships');
    expect(html).toContain('Holds tokens without votes');
  });

  it('says whether the market and the auction are open, in a word and not by colour alone', () => {
    expect(render({ modules: [market, auction] })).toContain('Open');
    const closed = render({
      modules: [market, auction],
      config: config({ marketplaceEnabled: false, auctionPaused: true })
    });
    expect(closed.match(/Closed/g)).toHaveLength(2);
    expect(closed).toContain('Propose opening');
    expect(closed).toContain('Propose starting auctions');
  });

  it('offers no opening nudge before launch or for a module it cannot vouch for', () => {
    expect(render({ live: false, config: config({ marketplaceEnabled: false }) })).not.toContain('Propose opening');
    expect(
      render({ modules: [{ ...market, vouched: false }], config: config({ marketplaceEnabled: false }) })
    ).not.toContain('Propose opening');
  });

  it('labels a module the Manager did not deploy', () => {
    expect(render({ modules: [{ ...claims, vouched: false }] })).toContain('Not deployed by Tribe Builder');
  });

  it('shows votes a module holds as a warning', () => {
    expect(render({ modules: [{ ...market, votes: 3n }] })).toContain('3 votes');
    expect(render({ modules: [{ ...market, votes: 1n }] })).toContain('1 vote<');
  });

  it('disables adding without a wallet and during a launch drive, and says why for a drive', () => {
    const disabled = (html: string) => /<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Add a module/s.test(html);
    expect(disabled(render({ canAct: false }))).toBe(true);
    const frozen = render({ frozen: true });
    expect(disabled(frozen)).toBe(true);
    expect(frozen).toContain('locked in for the launch drive');
    expect(disabled(render())).toBe(false);
  });

  it('shows the message from the last change beside the list', () => {
    expect(render({ message: 'Add the market to the tribe: added to the proposal draft.' })).toContain(
      'added to the proposal draft'
    );
  });

  it('says so when a tribe has no modules', () => {
    expect(render({ modules: [] })).toContain('This tribe has no modules yet.');
  });
});
