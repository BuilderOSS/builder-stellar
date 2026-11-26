import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipState } from '@/lib/membership-state';
import { ALICE, CLAIMS, config as baseConfig } from '@/lib/minter/test-fixtures';

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  membership: undefined as unknown,
  openLists: undefined as unknown,
  openListsError: undefined as unknown
}));

vi.mock('@creit.tech/stellar-wallets-kit/sdk', () => ({ StellarWalletsKit: {} }));
vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({ daoId: 'CTOKEN', routeId: 'lantern-club', daoConfig: state.config })
}));
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: () => ({ address: ALICE, authStatus: 'authenticated' })
}));
vi.mock('@/lib/membership-state', () => ({
  useMembershipState: () => ({ data: state.membership, isLoading: false, error: undefined, mutate: vi.fn() })
}));
vi.mock('@/lib/minter/hooks', () => ({
  useOpenClaimLists: () => ({ data: state.openLists, error: state.openListsError })
}));
vi.mock('@/lib/proposal-actions/use-propose-action', () => ({ useProposeAction: () => ({ propose: vi.fn() }) }));
vi.mock('@/lib/proposal-actions/use-editing-action', () => ({ useEditingAction: () => ({ done: vi.fn() }) }));
vi.mock('@/components/proposal-actions/pending-value', () => ({
  usePendingActions: () => [],
  PendingValue: () => null
}));
vi.mock('@/components/proposal-actions/editing-action-notice', () => ({ EditingActionNotice: () => null }));
vi.mock('@/components/admin/modules/modules-card', () => ({ ModulesCard: () => null }));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));

import { MembershipSettings } from './membership-settings';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const claimsModule = (allowance: number): MembershipState['modules'][number] => ({
  kind: 'claims',
  vouched: true,
  address: CLAIMS,
  nonVoting: true,
  allowance,
  agent: false,
  votes: 0n
});
const membership = (patch: Partial<MembershipState> = {}): MembershipState => ({
  admin: baseConfig.treasuryContractId,
  live: true,
  settings: { transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false },
  modules: [claimsModule(4)],
  ...patch
});
const indexed = (setupUnclaimed: number, setupLists = 1) => ({ lists: [], setupUnclaimed, setupLists });
const render = () => renderToStaticMarkup(<MembershipSettings />).replace(/<!-- -->/g, '');

describe('Founder supply in Manage → Membership', () => {
  beforeEach(() => {
    state.config = { ...baseConfig };
    state.membership = membership();
    state.openLists = indexed(6);
    state.openListsError = undefined;
  });

  it('shows what Setup lists can still mint, capped at the claims module’s allowance, with a link to the lists', () => {
    const html = render();
    expect(html).toContain('Founder supply: 4 tokens can still be minted');
    expect(html).toContain('6 tokens on a claim list opened during setup are not claimed yet');
    expect(html).toContain('The claims module can mint 4 tokens of them, its remaining mint allowance.');
    expect(html).toContain('A proposal can close a list early to stop this.');
    expect(html).toMatch(/href="\/dao\/lantern-club\/admin\/claims"[^>]*>See the claim lists</);
  });

  it('says when the claims module is not registered and so has no allowance', () => {
    state.membership = membership({ modules: [] });
    const html = render();
    expect(html).toContain('Founder supply on setup lists');
    expect(html).toContain(
      'The claims module has no mint allowance left, so none can be minted until a proposal raises it.'
    );
  });

  it('speaks of the launch admin in Setup', () => {
    state.membership = membership({ live: false, admin: ALICE, modules: [claimsModule(0)] });
    const html = render();
    expect(html).toContain('until the launch admin raises it');
    expect(html).not.toContain('until a proposal raises it');
    expect(html).toContain('They stay claimable after launch, until the list closes.');
  });

  it('says when the index cannot be read', () => {
    state.openLists = undefined;
    state.openListsError = new Error('index down');
    expect(render()).toContain('Founder supply could not be read from the index right now.');
  });

  it('shows nothing when no Setup list has tokens left, or the tribe has no claims module', () => {
    state.openLists = indexed(0, 0);
    expect(render()).not.toContain('Founder supply');
    state.openLists = indexed(6);
    state.config = { ...baseConfig, claimsContractId: '' };
    expect(render()).not.toContain('Founder supply');
  });
});
