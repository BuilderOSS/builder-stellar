import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyModule, type ModuleVersionState, planModuleUpdates } from '@/lib/module-updates';

const ADMIN = `G${'A'.repeat(55)}`;
const TREASURY = `C${'T'.repeat(55)}`;
const state = vi.hoisted(() => ({
  address: '',
  status: 'pending' as 'pending' | 'operational',
  admin: '',
  modules: [] as Array<{ module: 'token' | 'governor' | 'auction'; withdrawn?: boolean; current?: boolean }>
}));

vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({
    daoId: 'CDAO',
    routeId: 'fast-dao',
    daoConfig: { name: 'testnet', treasuryContractId: `C${'T'.repeat(55)}`, status: state.status, rpcUrl: '' }
  })
}));
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: () => ({ address: state.address }) }));
vi.mock('@/lib/use-admin-proposal-draft', () => ({
  useAdminProposalDraft: () => ({ pending: null, requestAddBatch: vi.fn(), cancel: vi.fn(), resolve: vi.fn() })
}));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
vi.mock('@/components/admin/admin-proposal-draft-dialog', () => ({ AdminProposalDraftDialog: () => null }));
vi.mock('@/lib/use-module-updates', () => ({
  upgradeModuleDirectly: vi.fn(),
  useModuleUpdates: () => {
    const rows = state.modules.map(({ module, withdrawn, current }) => {
      const raw: ModuleVersionState = {
        module,
        version: '0.1.0',
        fromHash: 'a'.repeat(64),
        source: { revoked: Boolean(withdrawn) },
        target: current ? null : { version: '0.2.0', hash: 'b'.repeat(64), revoked: false },
        approved: true
      };
      return {
        module,
        ok: true,
        state: { ...raw, contractId: `C${module}`, admin: state.admin, storageVersion: 1 },
        update: classifyModule(raw)
      };
    });
    return {
      rows,
      plan: planModuleUpdates(rows.map((row) => row.update)),
      isLoading: false,
      error: undefined,
      mutate: vi.fn()
    };
  }
}));

import { ContractUpdates } from './contract-updates';

// The existing Vitest config uses classic JSX, while Next uses the automatic runtime.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const render = () => renderToStaticMarkup(<ContractUpdates />).replace(/<!-- -->/g, '');

describe('ContractUpdates', () => {
  beforeEach(() => {
    state.address = ADMIN;
    state.status = 'pending';
    state.admin = ADMIN;
    state.modules = [{ module: 'token' }, { module: 'auction', current: true }];
  });

  it('lets the launch admin apply updates directly in setup, with the release note', () => {
    const html = render();
    expect(html).toContain('1 update available');
    expect(html).toContain('Membership token');
    expect(html).toContain('0.1.0 → 0.2.0');
    expect(html).toContain('Renaming the community');
    expect(html).toContain('Apply 1 update');
    expect(html).toContain('Up to date');
  });

  it('proposes ordinary updates together and Voting on its own once launched', () => {
    state.status = 'operational';
    state.admin = TREASURY;
    state.modules = [{ module: 'token' }, { module: 'auction' }, { module: 'governor' }];
    const html = render();
    expect(html).toContain('3 updates available');
    expect(html).toContain('Add 2 updates to your proposal');
    expect(html).toContain('Propose the Voting update');
    expect(html).not.toContain('Apply ');
  });

  it('explains a withdrawn version blocks launch in setup', () => {
    state.modules = [{ module: 'token', withdrawn: true }];
    expect(render()).toContain('launch on a withdrawn version. Apply the update below first.');
  });

  it('is read only for someone who is neither the launch admin nor a proposer', () => {
    state.address = `G${'B'.repeat(55)}`;
    const html = render();
    expect(html).toContain('Only the launch admin can apply updates during setup.');
    expect(html).not.toContain('Apply 1 update');
  });

  it('says plainly when everything is current', () => {
    state.modules = [{ module: 'token', current: true }];
    expect(render()).toContain('Everything is up to date');
  });
});
