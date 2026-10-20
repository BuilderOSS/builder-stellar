import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePendingActionStore } from '@/stores/pending-action-store';
import { selectDraft, useProposalComposerStore } from '@/stores/proposal-composer-store';

import { ACTION_SOURCES, type ActionRequest } from './action-request';
import { proposeAction, resolvePendingAction, validateAction } from './propose-action';
import { config, wallet } from './test-fixtures';

const address = wallet(1);
const daoId = 'propose-change-test';
const queue = () => selectDraft(address, daoId)(useProposalComposerStore.getState()).queuedActions;
const governance = (type: 'set-voting-period' | 'set-quorum-bps', value: string): ActionRequest => ({
  actions: [{ id: crypto.randomUUID(), type, recipient: '', amount: value, value }],
  source: ACTION_SOURCES.governance,
  note: `Set ${type} to ${value}.`
});

afterEach(() => {
  useProposalComposerStore.getState().reset(address, daoId);
  usePendingActionStore.getState().close();
});

describe('proposeAction', () => {
  it('adds a clean change at once, stamped with its source and note, without touching the step or text', () => {
    const store = useProposalComposerStore.getState();
    store.updateMetadata(address, daoId, { title: 'Mine' });
    store.setStep(address, daoId, 2);
    const notify = vi.fn();
    const result = proposeAction({ address, daoId, config, request: governance('set-voting-period', '86400'), notify });
    expect(result).toEqual({ outcome: 'added' });
    const draft = selectDraft(address, daoId)(useProposalComposerStore.getState());
    expect(draft.step).toBe(2);
    expect(draft.metadata.title).toBe('Mine');
    expect(draft.queuedActions[0]).toMatchObject({
      source: ACTION_SOURCES.governance,
      note: 'Set set-voting-period to 86400.'
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ previous: [], next: draft.queuedActions }));
  });

  it('undoes by putting the earlier queue back', () => {
    const notify = vi.fn();
    proposeAction({ address, daoId, config, request: governance('set-voting-period', '86400'), notify });
    proposeAction({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    expect(queue()).toHaveLength(2);
    useProposalComposerStore.getState().restore(address, daoId, notify.mock.calls[1][0].previous);
    expect(queue().map((entry) => entry.type)).toEqual(['set-voting-period']);
  });

  it('hands a clash to the dialog, and replace keeps the change’s place', () => {
    const notify = vi.fn();
    proposeAction({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    proposeAction({ address, daoId, config, request: governance('set-voting-period', '86400'), notify });
    const result = proposeAction({ address, daoId, config, request: governance('set-quorum-bps', '2500'), notify });
    expect(result).toEqual({ outcome: 'review' });
    expect(usePendingActionStore.getState().pending?.findings.some((f) => f.kind === 'conflict')).toBe(true);
    expect(resolvePendingAction('replace', notify)).toBe(true);
    expect(queue().map((entry) => entry.value)).toEqual(['2500', '86400']);
    expect(usePendingActionStore.getState().pending).toBeNull();
  });

  it('adds nothing when the member cancels or skips a repeat', () => {
    const notify = vi.fn();
    proposeAction({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    proposeAction({ address, daoId, config, request: governance('set-quorum-bps', '1000'), notify });
    expect(resolvePendingAction('skip', notify)).toBe(false);
    proposeAction({ address, daoId, config, request: governance('set-quorum-bps', '3000'), notify });
    expect(resolvePendingAction('cancel', notify)).toBe(false);
    expect(queue()).toHaveLength(1);
  });

  it('adds and removes a bundle as one unit', () => {
    const notify = vi.fn();
    const bundle: ActionRequest = {
      actions: [
        { id: crypto.randomUUID(), type: 'pause-auction', recipient: '', amount: '' },
        { id: crypto.randomUUID(), type: 'set-auction-duration', recipient: '', amount: '600', value: '600' },
        { id: crypto.randomUUID(), type: 'unpause-auction', recipient: '', amount: '' }
      ],
      bundle: { id: 'auction-bundle', label: 'Change the auction: 3 steps' },
      source: ACTION_SOURCES.auction,
      note: 'Each auction runs 10 minutes.'
    };
    // Pausing is high-risk, so the member confirms it once for the whole bundle.
    expect(proposeAction({ address, daoId, config, request: bundle, notify })).toEqual({ outcome: 'review' });
    resolvePendingAction('add', notify);
    expect(queue().every((entry) => entry.bundleId === 'auction-bundle')).toBe(true);
    useProposalComposerStore.getState().removeBundle(address, daoId, 'auction-bundle');
    expect(queue()).toHaveLength(0);
  });

  it('refuses what its handler refuses, and needs a wallet', () => {
    expect(validateAction(governance('set-quorum-bps', '0'), config, address)).toMatch(/quorum/i);
    expect(
      proposeAction({ address: null, daoId, config, request: governance('set-quorum-bps', '1000'), notify: vi.fn() })
    ).toEqual({
      outcome: 'no-wallet'
    });
    expect(
      proposeAction({ address, daoId, config, request: governance('set-quorum-bps', 'x'), notify: vi.fn() }).outcome
    ).toBe('invalid');
  });
});
