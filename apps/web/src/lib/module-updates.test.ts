import { describe, expect, it } from 'vitest';

import { classifyModule, type ModuleVersionState, planModuleUpdates } from './module-updates';

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);
const state = (patch: Partial<ModuleVersionState> = {}): ModuleVersionState => ({
  module: 'token',
  version: '0.1.0',
  fromHash: OLD,
  source: { revoked: false },
  target: { version: '0.2.0', hash: NEW, revoked: false },
  approved: true,
  ...patch
});

describe('classifyModule', () => {
  it('offers an approved newer release', () => {
    expect(classifyModule(state())).toMatchObject({ status: 'available', next: { version: '0.2.0', hash: NEW } });
  });

  it('is current when already on the latest, or when the latest is revoked', () => {
    expect(classifyModule(state({ target: { version: '0.1.0', hash: OLD, revoked: false } })).status).toBe('current');
    expect(classifyModule(state({ target: { version: '0.2.0', hash: NEW, revoked: true } })).status).toBe('current');
    expect(classifyModule(state({ target: null })).status).toBe('current');
  });

  it('flags a newer release this community is not approved to take', () => {
    expect(classifyModule(state({ approved: false }))).toMatchObject({ status: 'not-approved', next: null });
  });

  it('flags a withdrawn running version, keeping the approved way out', () => {
    expect(classifyModule(state({ source: { revoked: true } }))).toMatchObject({
      status: 'withdrawn',
      next: { version: '0.2.0' }
    });
    expect(classifyModule(state({ source: { revoked: true }, approved: false })).next).toBeNull();
  });
});

describe('planModuleUpdates', () => {
  it('batches ordinary modules and keeps Voting and Treasury separate', () => {
    const plan = planModuleUpdates(
      (['token', 'auction', 'governor', 'treasury'] as const).map((module) => classifyModule(state({ module })))
    );
    expect(plan.batch.map((u) => u.module)).toEqual(['token', 'auction']);
    expect(plan.separate.map((u) => u.module)).toEqual(['governor', 'treasury']);
    expect(plan.actionable).toHaveLength(4);
  });
});
