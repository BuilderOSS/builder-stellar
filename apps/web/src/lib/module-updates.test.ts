import { describe, expect, it } from 'vitest';

import {
  classifyModule,
  moduleLabelInSentence,
  type ModuleUpdate,
  type ModuleVersionState,
  planModuleUpdates,
  upgradeProposalMetadata
} from './module-updates';

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
  it('batches every module, Voting included, and keeps only the Treasury separate', () => {
    const plan = planModuleUpdates(
      (['token', 'auction', 'governor', 'treasury'] as const).map((module) => classifyModule(state({ module })))
    );
    expect(plan.batch.map((u) => u.module)).toEqual(['token', 'auction', 'governor']);
    expect(plan.separate.map((u) => u.module)).toEqual(['treasury']);
    expect(plan.actionable).toHaveLength(4);
  });
});

describe('moduleLabelInSentence', () => {
  it('names each contract the way it reads mid-sentence', () => {
    expect(moduleLabelInSentence('governor')).toBe('proposals and votes');
    expect(moduleLabelInSentence('auction')).toBe('the auction');
    expect(moduleLabelInSentence('token')).toBe('the membership token');
  });
});

describe('upgradeProposalMetadata', () => {
  const update = (module: ModuleUpdate['module'], version = '0.2.0'): ModuleUpdate => ({
    module,
    status: 'available',
    current: '0.1.0',
    next: { version, hash: 'h' },
    fromHash: 'f'
  });

  it('names every contract in a batch and carries each release note', () => {
    const meta = upgradeProposalMetadata([update('governor'), update('auction'), update('marketplace')]);
    expect(meta.title).toBe('Upgrade proposals and votes, the auction and the market to 0.2.0');
    expect(meta.description).toContain('Proposals and votes 0.1.0 → 0.2.0: Members can comment on proposals');
    expect(meta.description).toContain('Auction 0.1.0 → 0.2.0: Bidders can add a short comment');
    expect(meta.description).toContain('Market 0.1.0 → 0.2.0:');
  });

  it('keeps a single upgrade plain', () => {
    const meta = upgradeProposalMetadata([update('auction')]);
    expect(meta.title).toBe('Upgrade the auction to 0.2.0');
    expect(meta.description.startsWith('Bidders can add a short comment')).toBe(true);
  });

  it('says latest releases when versions differ', () => {
    expect(upgradeProposalMetadata([update('token', '0.3.0'), update('auction')]).title).toBe(
      'Upgrade the membership token and the auction to their latest releases'
    );
  });
});
