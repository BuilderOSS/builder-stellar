import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  balances: { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() } as Record<
    string,
    unknown
  >,
  history: { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() } as Record<
    string,
    unknown
  >,
  historyHook: vi.fn()
}));
vi.mock('@/contexts/dao-context', () => {
  const value = {
    daoId: 'dao-a',
    routeId: 'dao-a',
    daoConfig: {
      name: 'testnet',
      treasuryContractId: 'treasury-a',
      governorContractId: 'governor-a',
      tokenContractId: 'dao-a'
    }
  };
  return { useDaoContext: () => value, useOptionalDaoContext: () => value };
});
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (state: unknown) => unknown) => selector({ address: '', authStatus: 'disconnected' })
}));
vi.mock('@/lib/treasury-queries', () => ({ useTreasuryBalances: () => mock.balances }));
vi.mock('@/lib/treasury-service/hooks', () => ({
  clientTreasuryScope: () => ({
    deploymentId: 'deployment-a',
    daoId: 'dao-a',
    treasuryContractId: 'treasury-a',
    governorContractId: 'governor-a'
  }),
  useTreasuryHistory: (...args: unknown[]) => {
    mock.historyHook(...args);
    return mock.history;
  }
}));
vi.mock('./fund-treasury', () => ({ FundTreasury: () => <div>Funding form</div> }));
vi.mock('./transfer-proposal', () => ({ TransferProposal: () => <div>Governance queue shortcut</div> }));
vi.mock('./treasury-tokens', () => ({ TreasuryTokens: () => null }));

import { TreasuryWorkspace } from './treasury-workspace';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  mock.balances.data = undefined;
  mock.balances.error = undefined;
  mock.balances.isLoading = false;
  mock.history.data = undefined;
  mock.history.error = undefined;
  mock.history.isLoading = false;
  mock.historyHook.mockClear();
});

describe('treasury rendered read states', () => {
  it('shows exact balances, including large integers and the final stroop', () => {
    mock.balances.data = [
      { assetCode: 'XLM', isNative: true, balance: '9007199254740993.0000001' },
      { assetCode: 'USDC', isNative: false, balance: '0.0000000' }
    ];
    const html = renderToStaticMarkup(<TreasuryWorkspace />);
    expect(html).toContain('9,007,199,254,740,993.0000001');
    expect(html).toContain('0.0000000');
    expect(html).toContain('1 funded asset');
    expect(mock.historyHook).toHaveBeenCalledWith(
      {
        deploymentId: 'deployment-a',
        daoId: 'dao-a',
        treasuryContractId: 'treasury-a',
        governorContractId: 'governor-a'
      },
      0
    );
  });
  it('does not render cached balances as current, a funded zero count, or an empty history when reads fail', () => {
    mock.balances.data = [{ assetCode: 'XLM', balance: '999.0000000', isNative: true }];
    mock.balances.error = new Error('RPC unavailable');
    mock.history.data = { calls: [], hasMore: false };
    mock.history.error = new Error('Index unavailable');
    const html = renderToStaticMarkup(<TreasuryWorkspace />);
    expect(html).toContain('Balances unavailable');
    expect(html).toContain('Execution history unavailable');
    expect(html).not.toContain('999.0000000');
    expect(html).not.toContain('0 funded assets');
    expect(html).not.toContain('No payouts yet');
  });
  it('links each call to its proposal receipt and network transaction, preserving the complete hash', () => {
    mock.history.data = {
      calls: [
        {
          eventId: 'event-1',
          proposalId: '07'.repeat(32),
          index: 0,
          function: 'transfer',
          target: 'asset-sac',
          ledger: '100',
          at: null,
          transactionHash: 'aa'.repeat(32)
        }
      ],
      hasMore: true
    };
    const html = renderToStaticMarkup(<TreasuryWorkspace />);
    expect(html).toContain(`/dao/dao-a/proposals/${'07'.repeat(32)}`);
    expect(html).toContain('View proposal');
    expect(html).toContain('aa'.repeat(32));
    expect(html).toContain('Ledger 100');
    expect(html).toContain('aria-label="Treasury execution history pages"');
  });
});
