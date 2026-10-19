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
  modules: [] as Array<{
    module: 'token' | 'governor' | 'auction' | 'treasury';
    withdrawn?: boolean;
    current?: boolean;
  }>
}));

vi.mock('@/contexts/dao-context', () => ({
  useDaoContext: () => ({
    daoId: 'CDAO',
    routeId: 'fast-dao',
    daoConfig: { name: 'testnet', treasuryContractId: `C${'T'.repeat(55)}`, status: state.status, rpcUrl: '' }
  })
}));
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: () => ({ address: state.address }) }));
vi.mock('@/lib/proposal-changes/use-propose-change', () => ({
  useProposeChange: () => ({ propose: vi.fn(() => ({ outcome: 'added' })), canPropose: true })
}));
vi.mock('@/lib/proposal-changes/use-editing-change', () => ({
  useEditingChange: () => ({ editing: null, bundle: [], replaces: undefined, done: vi.fn() })
}));
vi.mock('@/components/proposal-changes/pending-value', () => ({
  PendingValue: () => null,
  usePendingChanges: () => []
}));
vi.mock('@/lib/transaction-feedback', () => ({
  useTransactionFeedback: () => ({ start: vi.fn(), submitted: vi.fn(), success: vi.fn(), fail: vi.fn() })
}));
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

  it('lets the launch admin apply upgrades directly in setup, with the release note', () => {
    const html = render();
    expect(html).toContain('1 upgrade available');
    expect(html).toContain('Membership token');
    expect(html).toContain('0.1.0 → 0.2.0');
    expect(html).toContain('Renaming the tribe');
    expect(html).toContain('Apply 1 upgrade');
    expect(html).toContain('Up to date');
  });

  it('proposes every upgrade together, Voting included, once launched', () => {
    state.status = 'operational';
    state.admin = TREASURY;
    state.modules = [{ module: 'token' }, { module: 'auction' }, { module: 'governor' }];
    const html = render();
    expect(html).toContain('3 upgrades available');
    expect(html).toContain('Add 3 upgrades to proposal');
    expect(html).not.toContain('upgrade to proposal');
    expect(html).not.toContain('Apply ');
  });

  it('keeps a Treasury upgrade in its own proposal', () => {
    state.status = 'operational';
    state.admin = TREASURY;
    state.modules = [{ module: 'auction' }, { module: 'treasury' }];
    const html = render();
    expect(html).toContain('Add 1 upgrade to proposal');
    expect(html).toContain('Add the treasury upgrade to proposal');
    expect(html).toContain('its upgrade goes in its own proposal');
  });

  it('explains a withdrawn version blocks launch in setup', () => {
    state.modules = [{ module: 'token', withdrawn: true }];
    expect(render()).toContain('launch on a withdrawn version. Apply the upgrade below first.');
  });

  it('is read only for someone who is neither the launch admin nor a proposer', () => {
    state.address = `G${'B'.repeat(55)}`;
    const html = render();
    expect(html).toContain('Only the launch admin can apply upgrades during setup.');
    expect(html).not.toContain('Apply 1 upgrade');
  });

  it('says plainly when everything is current', () => {
    state.modules = [{ module: 'token', current: true }];
    expect(render()).toContain('Everything is up to date');
  });
});
