import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePendingChangeStore } from '@/stores/pending-change-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { CHANGE_SOURCES, type ChangeRequest } from './change-request';
import { proposeChange, resolvePendingChange, validateChange } from './propose-change';
import { config, wallet } from './test-fixtures';

const address = wallet(1);
const daoId = 'propose-change-test';
const queue = () => selectDraft(address, daoId)(useProposalComposerStore.getState()).queuedActions;
const governance = (type: 'set-voting-period' | 'set-quorum-bps', value: string): ChangeRequest => ({
  actions: [{ id: crypto.randomUUID(), type, recipient: '', amount: value, value }],
  source: CHANGE_SOURCES.governance,
  note: `Set ${type} to ${value}.`
});

afterEach(() => {
  useProposalComposerStore.getState().reset(address, daoId);
  usePendingChangeStore.getState().close();
});

describe('proposeChange', () => {
  it('adds a clean change at once, stamped with its source and note, without touching the step or text', () => {
    const store = useProposalComposerStore.getState();
    store.updateMetadata(address, daoId, { title: 'Mine' });
    store.setStep(address, daoId, 2);
    const notify = vi.fn();
    const result = proposeChange({ address, daoId, config, request: governance('set-voting-period', '86400'), notify });
    expect(result).toEqual({ outcome: 'added' });
    const draft = selectDraft(address, daoId)(useProposalComposerStore.getState());
    expect(draft.step).toBe(2);
    expect(draft.metadata.title).toBe('Mine');
    expect(draft.queuedActions[0]).toMatchObject({
      source: CHANGE_SOURCES.governance,
      note: 'Set set-voting-period to 86400.'
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ previous: [], next: draft.queuedActions }));
  });

  it('undoes by putting the earlier queue back', () => {
    const notify = vi.fn();
    proposeChange({ address, daoId, config, request: governance('set-voting-period', '86400'), notify });
    proposeChange({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    expect(queue()).toHaveLength(2);
    useProposalComposerStore.getState().restore(address, daoId, notify.mock.calls[1][0].previous);
    expect(queue().map((entry) => entry.type)).toEqual(['set-voting-period']);
  });

  it('hands a clash to the dialog, and replace keeps the change’s place', () => {
    const notify = vi.fn();
    proposeChange({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    proposeChange({ address, daoId, config, request: governance('set-voting-period', '86400'), notify });
    const result = proposeChange({ address, daoId, config, request: governance('set-quorum-bps', '2500'), notify });
    expect(result).toEqual({ outcome: 'review' });
    expect(usePendingChangeStore.getState().pending?.findings.some((f) => f.kind === 'conflict')).toBe(true);
    expect(resolvePendingChange('replace', notify)).toBe(true);
    expect(queue().map((entry) => entry.value)).toEqual(['2500', '86400']);
    expect(usePendingChangeStore.getState().pending).toBeNull();
  });

  it('adds nothing when the member cancels or skips a repeat', () => {
    const notify = vi.fn();
    proposeChange({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    proposeChange({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    expect(resolvePendingChange('skip', notify)).toBe(false);
    proposeChange({ address, daoId, config, request: governance('set-quorum-bps', '3000'), notify });
    expect(resolvePendingChange('cancel', notify)).toBe(false);
    expect(queue()).toHaveLength(1);
  });

  it('adds and removes a bundle as one unit', () => {
    const notify = vi.fn();
    const bundle: ChangeRequest = {
      actions: [
        { id: crypto.randomUUID(), type: 'pause-auction', recipient: '', amount: '' },
        { id: crypto.randomUUID(), type: 'set-auction-duration', recipient: '', amount: '600', value: '600' },
        { id: crypto.randomUUID(), type: 'unpause-auction', recipient: '', amount: '' }
      ],
      bundle: { id: 'auction-bundle', label: 'Change the auction: 3 steps' },
      source: CHANGE_SOURCES.auction,
      note: 'Each auction runs 10 minutes.'
    };
    // Pausing is high-risk, so the member confirms it once for the whole bundle.
    expect(proposeChange({ address, daoId, config, request: bundle, notify })).toEqual({ outcome: 'review' });
    resolvePendingChange('add', notify);
    expect(queue().every((entry) => entry.bundleId === 'auction-bundle')).toBe(true);
    useProposalComposerStore.getState().removeBundle(address, daoId, 'auction-bundle');
    expect(queue()).toHaveLength(0);
  });

  it('refuses what its handler refuses, and needs a wallet', () => {
    expect(validateChange(governance('set-quorum-bps', '0'), config, address)).toMatch(/quorum/i);
    expect(
      proposeChange({ address: null, daoId, config, request: governance('set-quorum-bps', '1000'), notify: vi.fn() })
    ).toEqual({
      outcome: 'no-wallet'
    });
    expect(
      proposeChange({ address, daoId, config, request: governance('set-quorum-bps', 'x'), notify: vi.fn() }).outcome
    ).toBe('invalid');
  });
});
