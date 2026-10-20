import { describe, expect, it } from 'vitest';

import { migrateStoredV3 } from '@/stores/proposal-composer-store';

import { CHANGE_SOURCES } from './change-request';
import { clampComposerStep, migrateActionV3, migrateDraftV3 } from './migrate-drafts';
import { action } from './test-fixtures';

describe('v3 → v4 draft migration', () => {
  it('names each action’s page from its type, falling back to the draft’s old source', () => {
    expect(migrateActionV3(action('set-quorum-bps')).source).toEqual(CHANGE_SOURCES.governance);
    expect(migrateActionV3(action('transfer-sac-token'), 'admin/token').source).toEqual(CHANGE_SOURCES.treasury);
    expect(migrateActionV3(action('change-mint-allowance'), 'claims/lists').source).toEqual(CHANGE_SOURCES.claims);
    expect(migrateActionV3(action('change-mint-allowance'), 'Marketplace administration').source).toEqual(
      CHANGE_SOURCES.marketplace
    );
    expect(migrateActionV3(action('change-mint-allowance')).source).toEqual(CHANGE_SOURCES.membership);
  });

  it('stores an open pool’s closing time as unix seconds', () => {
    const local = '2026-11-01T12:30';
    const migrated = migrateActionV3(action('open-pool', { expiresAt: local }));
    expect(migrated.expiresAt).toBe(String(Math.floor(new Date(local).getTime() / 1000)));
    expect(migrateActionV3(action('open-pool', { expiresAt: '1790000000' })).expiresAt).toBe('1790000000');
  });

  it('drops prepopulatedFrom and keeps everything else', () => {
    const draft = migrateDraftV3({
      step: 2,
      metadata: { title: 'Kept', description: '', url: '' },
      prepopulatedFrom: 'Treasury',
      queuedActions: [action('transfer-sac-token')]
    });
    expect(draft).not.toHaveProperty('prepopulatedFrom');
    // v3's why (1) and actions (2) steps are now one Write step; its review (3) is step 2.
    expect(draft.step).toBe(1);
    expect(migrateDraftV3({ step: 1, queuedActions: [] }).step).toBe(1);
    expect(migrateDraftV3({ step: 3, queuedActions: [] }).step).toBe(2);
    expect(draft.queuedActions?.[0].note).toBe('');
  });

  it('reads a saved v3 store as v4', () => {
    const raw = JSON.stringify({
      state: { draftsByWallet: { W: { dao: { queuedActions: [action('set-voting-delay')], prepopulatedFrom: 'x' } } } },
      version: 0
    });
    const migrated = JSON.parse(migrateStoredV3(raw)!);
    expect(migrated.state.draftsByWallet.W.dao.queuedActions[0].source).toEqual(CHANGE_SOURCES.governance);
    expect(migrateStoredV3(null)).toBeNull();
    expect(migrateStoredV3('not json')).toBeNull();
  });
});

describe('clampComposerStep', () => {
  it('keeps Write and Review, and treats anything past writing as Review', () => {
    expect(clampComposerStep(1)).toBe(1);
    expect(clampComposerStep(2)).toBe(2);
    expect(clampComposerStep(3)).toBe(2);
    expect(clampComposerStep(undefined)).toBe(1);
    expect(clampComposerStep(0)).toBe(1);
  });
});
