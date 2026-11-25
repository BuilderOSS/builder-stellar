import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALICE, list as baseList, state as baseState, TOKEN } from '@/lib/minter/test-fixtures';
import type { ClaimListView, ClaimState } from '@/lib/minter/types';

const PASSPHRASE = 'Test SDF Network ; September 2015';
const state = vi.hoisted(() => ({
  claims: undefined as unknown,
  history: undefined as unknown,
  config: {} as Record<string, unknown>,
  canManage: false,
  address: 'GALICE',
  canClose: undefined as boolean | undefined,
  openLists: undefined as unknown,
  propose: vi.fn()
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: vi.fn() }), default: vi.fn() }));
vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({ daoId: 'CTOKEN', routeId: 'lantern-club', daoConfig: state.config })
}));
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    () => ({
      address: state.address,
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
  useClaimHistory: () => ({ data: state.history, isLoading: false, error: undefined, mutate: vi.fn() }),
  useClaimMinterCanCloseLists: () => ({ data: state.canClose }),
  useOpenClaimLists: () => ({ data: state.openLists, error: undefined })
}));
vi.mock('@/lib/proposal-actions/use-propose-action', () => ({ useProposeAction: () => ({ propose: state.propose }) }));
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

describe('Past claims', () => {
  beforeEach(() => {
    state.claims = claimsState([]);
    state.config = { name: 'testnet', passphrase: PASSPHRASE, tokenContractId: TOKEN, rpcUrl: 'https://rpc.test' };
  });
  afterAll(() => {
    state.history = undefined;
  });

  // BUG-W06-3: a one-token claim read "1 tokens from Claim list 1".
  it('counts one token in the singular', () => {
    const row = { list_id: 0, recipient: null, transaction_hash: null, paid: null, escrowed: false };
    state.history = {
      total: 2,
      hasMore: false,
      items: [
        { ...row, claim_id: 'a', amount: '1' },
        { ...row, claim_id: 'b', amount: '3' }
      ]
    };
    const html = render();
    expect(html).toContain('1 token from Claim list 1');
    expect(html).toContain('3 tokens from Claim list 1');
    expect(html).not.toContain('1 tokens');
  });
});

describe('Closing a claim list early', () => {
  const open = { ...baseList, assurance: null, expiresAt: Math.floor(Date.now() / 1000) + 86_400 };
  beforeEach(() => {
    state.address = ALICE;
    state.canManage = true;
    state.canClose = true;
    state.claims = claimsState([open]);
    state.config = { name: 'testnet', passphrase: PASSPHRASE, tokenContractId: TOKEN, status: 'operational' };
  });
  afterAll(() => {
    state.address = 'GALICE';
    state.canClose = undefined;
  });

  it('is a proposal action for members once the tribe is live', () => {
    state.claims = { ...claimsState([open]), live: true };
    const html = render(true);
    expect(html).toContain('Close in proposal');
    expect(html).not.toContain('Close this list');
    // Only on the manage view.
    expect(render()).not.toContain('Close in proposal');
  });

  it('is not offered for a ClaimMinter without close_list (0.5.0), or while that is unknown', () => {
    state.claims = { ...claimsState([open]), live: true };
    state.canClose = false;
    expect(render(true)).not.toContain('Close in proposal');
    state.canClose = undefined;
    expect(render(true)).not.toContain('Close in proposal');
  });

  it('is the launch admin’s own call in Setup, except for the launch drive', () => {
    state.claims = { ...claimsState([open]), admin: ALICE };
    expect(render(true)).toContain('Close this list');
    const drive = { ...open, assurance: { thresholdClaimers: 5, deadline: open.expiresAt, state: 'open' as const } };
    state.claims = { ...claimsState([drive]), admin: ALICE };
    expect(render(true)).not.toContain('Close this list');
  });

  it('is not offered for a list that has ended', () => {
    state.claims = { ...claimsState([{ ...open, expiresAt: deadline }]), live: true };
    expect(render(true)).not.toContain('Close in proposal');
  });
});

describe('Founder supply on the claims page', () => {
  const open = { ...baseList, listId: 0, assurance: null, expiresAt: Math.floor(Date.now() / 1000) + 86_400 };
  const indexed = (setupUnclaimed: number) => ({
    lists: [{ listId: 0, isAssurance: false, openedInSetup: true }],
    setupUnclaimed,
    setupLists: 1
  });
  beforeEach(() => {
    state.claims = { ...claimsState([open]), live: true, allowance: 7 };
    state.config = { name: 'testnet', passphrase: PASSPHRASE, tokenContractId: TOKEN, claimsContractId: 'CCLAIMS' };
  });
  afterAll(() => {
    state.openLists = undefined;
  });

  it('shows what Setup lists can still mint, and marks the list', () => {
    state.openLists = indexed(6);
    const html = render();
    expect(html).toContain('Founder supply: 6 tokens can still be minted');
    expect(html).toContain('A proposal can close a list early to stop this.');
    expect(html).toContain('Opened during setup: its 7 unclaimed tokens are founder');
  });

  it('caps it at the claims module’s allowance', () => {
    state.openLists = indexed(12);
    expect(render()).toContain('Founder supply: 7 tokens can still be minted');
  });

  it('shows nothing when no Setup list has tokens left', () => {
    state.openLists = { lists: [], setupUnclaimed: 0, setupLists: 0 };
    expect(render()).not.toContain('Founder supply');
  });
});

describe('A claim list open until u64::MAX', () => {
  it('reads as having no closing date', () => {
    state.claims = claimsState([{ ...baseList, assurance: null, expiresAt: Number('18446744073709551615') }]);
    state.config = { name: 'testnet', passphrase: PASSPHRASE, tokenContractId: TOKEN };
    const html = render();
    expect(html).toContain('no closing date');
    expect(html).not.toContain('Invalid Date');
  });

  it('reads as a launch drive with no deadline', () => {
    const far = Number('18446744073709551615');
    const drive = {
      ...baseList,
      expiresAt: far,
      assurance: { thresholdClaimers: 5, deadline: far, state: 'open' as const }
    };
    state.claims = claimsState([drive]);
    state.config = { name: 'testnet', passphrase: PASSPHRASE, tokenContractId: TOKEN };
    const html = render();
    expect(html).toContain('2 of 5 people needed, with no deadline. Payments are held until launch.');
    expect(html).not.toContain('Invalid Date');
  });
});
