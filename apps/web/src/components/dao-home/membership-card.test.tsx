import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEMBER = `G${'M'.repeat(55)}`;
const DELEGATE = `G${'D'.repeat(55)}`;
const state = vi.hoisted(() => ({ custom: false }));

vi.mock('@/contexts/dao-context', () => ({ useDaoContext: () => ({ routeId: 'lantern-club' }) }));
vi.mock('@/hooks/use-dao-membership', () => ({
  useDaoMembership: () => ({
    address: MEMBER,
    isLoading: false,
    isMember: true,
    member: { address: MEMBER, delegated_to: DELEGATE },
    tokenCount: 1n,
    votingPower: state.custom ? 2_500_000_000n : 1n,
    voteDecimals: state.custom ? 9 : 0,
    customVoteSource: state.custom
  })
}));

vi.stubGlobal('React', React);
const { MembershipCard } = await import('./membership-card');
type Config = Parameters<typeof MembershipCard>[0]['config'];
const config = { tokenName: 'Lantern Club' } as Config;
const market = {
  tokenName: 'Lantern Club',
  marketplaceContractId: 'CM',
  marketplaceEnabled: true,
  status: 'operational',
  tokenSettings: { transfersLocked: false }
} as Config;

describe('membership card and the vote source', () => {
  beforeEach(() => {
    state.custom = false;
  });

  it('shows token votes and a delegation on a token-weighted tribe', () => {
    const html = renderToStaticMarkup(<MembershipCard config={config} />);
    expect(html).toContain('Delegated');
  });

  it('shows adapter votes in units and no delegation when votes come from an adapter', () => {
    state.custom = true;
    const html = renderToStaticMarkup(<MembershipCard config={config} />);
    expect(html).toContain('2.5');
    expect(html).not.toContain('Delegated');
  });

  it('offers Sell a token, linking to the sell form, when the tribe has a live market', () => {
    const html = renderToStaticMarkup(<MembershipCard config={market} />);
    expect(html).toContain('Sell a token');
    expect(html).toContain('/dao/lantern-club/marketplace?sell=1');
  });

  it('hides Sell without a market, when it is off, or when tokens are locked', () => {
    for (const patch of [
      { marketplaceContractId: '' },
      { marketplaceEnabled: false },
      { tokenSettings: { transfersLocked: true } }
    ]) {
      const html = renderToStaticMarkup(<MembershipCard config={{ ...market, ...patch } as Config} />);
      expect(html).not.toContain('Sell a token');
    }
    expect(renderToStaticMarkup(<MembershipCard config={config} />)).not.toContain('Sell a token');
  });
});
