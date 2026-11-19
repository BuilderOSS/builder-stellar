import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALICE, list as baseList, state as baseState, TOKEN } from '@/lib/minter/test-fixtures';
import type { ClaimListView, ClaimState } from '@/lib/minter/types';

const PASSPHRASE = 'Test SDF Network ; September 2015';
const state = vi.hoisted(() => ({
  claims: undefined as unknown,
  config: {} as Record<string, unknown>,
  canManage: false
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: vi.fn() }), default: vi.fn() }));
vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({ daoId: 'CTOKEN', routeId: 'lantern-club', daoConfig: state.config })
}));
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    () => ({
      address: 'GALICE',
      authStatus: 'authenticated',
      walletNetworkIssue: '',
      walletNetworkPassphrase: 'Test SDF Network ; September 2015'
    }),
    { getState: () => ({}) }
  )
}));
vi.mock('@/lib/minter/hooks', () => ({
  claimFetch: vi.fn(),
  useCurrentClaims: () => ({ data: state.claims, isLoading: false, error: undefined, mutate: vi.fn() }),
  useClaimHistory: () => ({ data: undefined, isLoading: false, error: undefined, mutate: vi.fn() })
}));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
vi.mock('./allocation-draft', () => ({ ClaimListDraftForm: () => null }));
vi.mock('@/hooks/use-dao-membership', () => ({ useDaoMembership: () => ({ canManage: state.canManage }) }));

import { Claims } from './claims';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const deadline = Math.floor(Date.now() / 1000) - 3600;
const failedDrive = (patch: Partial<ClaimListView> = {}): ClaimListView => ({
  ...baseList,
  claimed: 1,
  escrowed: '50',
  expiresAt: deadline,
  assurance: { thresholdClaimers: 5, deadline, state: 'failed' },
  ...patch
});
const claimsState = (lists: ClaimListView[]): ClaimState => ({
  ...baseState,
  address: ALICE,
  live: false,
  lists
});
const render = (admin = false) => renderToStaticMarkup(<Claims admin={admin} />).replace(/<!-- -->/g, '');

describe('Claims on a failed launch drive', () => {
  beforeEach(() => {
    state.claims = claimsState([failedDrive()]);
    state.config = {
      name: 'testnet',
      passphrase: PASSPHRASE,
      tokenContractId: TOKEN,
      rpcUrl: 'https://rpc.test',
      assuranceOutcome: 'open',
      assuranceDeadline: deadline
    };
  });

  it('shows the refund and, beside it, a way to free the link', () => {
    const html = render();
    expect(html).toContain('Take back');
    expect(html).toContain('Free the link');
    expect(html.indexOf('Take back')).toBeLessThan(html.indexOf('Free the link'));
  });

  it('still offers it when the wallet has nothing to take back, and on the manage view', () => {
    state.claims = claimsState([failedDrive({ escrowed: '0', claimed: 0 })]);
    expect(render()).toContain('Free the link');
    expect(render(true)).toContain('Free the link');
  });

  it('hides it once the indexed outcome is released, leaving the refund', () => {
    state.config = { ...state.config, assuranceOutcome: 'released' };
    const html = render();
    expect(html).toContain('Take back');
    expect(html).not.toContain('Free the link');
  });

  it('does not offer it before the deadline or on an ordinary claim list', () => {
    const later = Math.floor(Date.now() / 1000) + 3600;
    state.config = { ...state.config, assuranceDeadline: later };
    state.claims = claimsState([failedDrive({ assurance: { thresholdClaimers: 5, deadline: later, state: 'open' } })]);
    expect(render()).not.toContain('Free the link');

    state.config = { ...state.config, assuranceDeadline: deadline };
    state.claims = claimsState([{ ...baseList, assurance: null }]);
    expect(render()).not.toContain('Free the link');
  });
});

describe('Claims, the way to manage lists', () => {
  beforeEach(() => {
    state.claims = claimsState([{ ...baseList, assurance: null }]);
    state.config = { name: 'testnet', passphrase: PASSPHRASE, tokenContractId: TOKEN, status: 'operational' };
    state.canManage = false;
  });

  it('is hidden from visitors who cannot manage', () => {
    const html = render();
    expect(html).not.toContain('Manage claim lists');
    expect(html).not.toContain('Propose a claim list');
  });

  it('is a proposal for members once the tribe is live', () => {
    state.canManage = true;
    const html = render();
    expect(html).toContain('Propose a claim list');
    expect(html).toContain('href="/dao/lantern-club/admin/claims"');
  });

  it('is direct management for the launch admin in Setup', () => {
    state.canManage = true;
    state.config = { ...state.config, status: 'pending' };
    expect(render()).toContain('Manage claim lists');
  });

  it('always offers the member view from the manage view', () => {
    expect(render(true)).toContain('See the member view');
  });
});
