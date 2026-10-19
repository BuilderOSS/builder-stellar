import { describe, expect, it } from 'vitest';

import { CHANGE_SOURCES, type ChangeRequest } from './change-request';
import { resolveChange, reviewChange } from './review';
import { action, setting } from './test-fixtures';

const request = (actions: ChangeRequest['actions'], extra: Partial<ChangeRequest> = {}): ChangeRequest => ({
  actions,
  source: CHANGE_SOURCES.governance,
  note: 'A note.',
  ...extra
});

describe('reviewing a change', () => {
  it('asks when a setting already in the proposal is set again, and replace swaps it in place', () => {
    const existing = [
      setting('set-quorum-bps', '1000'),
      action('transfer-sac-token', { recipient: 'G1', amount: '5' })
    ];
    const change = request([setting('set-quorum-bps', '2000')]);
    const { findings, needsReview } = reviewChange(change, existing);
    expect(needsReview).toBe(true);
    expect(findings.find((finding) => finding.kind === 'conflict')?.existingIds).toEqual([existing[0].id]);

    const replaced = resolveChange(change, existing, findings, 'replace');
    expect(replaced.map((entry) => entry.value ?? entry.type)).toEqual(['2000', 'transfer-sac-token']);
    expect(replaced[0].source).toEqual(CHANGE_SOURCES.governance);
    expect(replaced[0].note).toBe('A note.');

    expect(resolveChange(change, existing, findings, 'keep')).toHaveLength(3);
    expect(resolveChange(change, existing, findings, 'skip')).toHaveLength(2);
  });

  it('never adds an exact repeat, and ignores where a change came from when comparing', () => {
    const existing = [{ ...setting('set-voting-delay', '600'), source: CHANGE_SOURCES.composer, note: 'Older.' }];
    const change = request([setting('set-voting-delay', '600')]);
    const { findings } = reviewChange(change, existing);
    expect(findings.some((finding) => finding.kind === 'duplicate')).toBe(true);
    expect(resolveChange(change, existing, findings, 'keep')).toHaveLength(1);
  });

  it('adds a change with nothing to warn about straight away', () => {
    const { needsReview } = reviewChange(request([setting('set-voting-period', '86400')]), []);
    expect(needsReview).toBe(false);
  });

  it('checks an edit against the proposal without the change it replaces', () => {
    const existing = [setting('set-quorum-bps', '1000')];
    const edit = request([setting('set-quorum-bps', '1500')], { replaces: [existing[0].id] });
    const { findings, needsReview } = reviewChange(edit, existing);
    expect(needsReview).toBe(false);
    const next = resolveChange(edit, existing, findings, 'add');
    expect(next.map((entry) => entry.value)).toEqual(['1500']);
  });

  it('keeps a replaced step inside its bundle', () => {
    const bundle = [action('pause-auction'), setting('set-auction-duration', '600'), action('unpause-auction')].map(
      (entry) => ({ ...entry, bundleId: 'b', bundleLabel: 'Change the auction: 3 steps' })
    );
    const change = request([setting('set-auction-duration', '900')]);
    const { findings } = reviewChange(change, bundle);
    const next = resolveChange(change, bundle, findings, 'replace');
    expect(next.map((entry) => entry.type)).toEqual(['pause-auction', 'set-auction-duration', 'unpause-auction']);
    expect(next[1].value).toBe('900');
    expect(next[1].bundleId).toBe('b');
  });

  it('adds or skips a bundle as one unit', () => {
    const existing = [action('pause-auction')];
    const bundle = request([action('pause-auction'), action('unpause-auction')], {
      bundle: { id: 'b', label: 'Change the auction: 2 steps' }
    });
    const { findings } = reviewChange(bundle, existing);
    expect(resolveChange(bundle, existing, findings, 'skip')).toEqual(existing);
    const kept = resolveChange(bundle, existing, findings, 'keep');
    expect(kept).toHaveLength(3);
    expect(kept.slice(1).every((entry) => entry.bundleId === 'b')).toBe(true);
  });
});

describe('composer changes', () => {
  it('wraps a lone auction setting in pause and resume', async () => {
    const { composerChange } = await import('./composer-change');
    const change = composerChange(setting('set-auction-duration', '600'), []);
    expect(change.actions.map((entry) => entry.type)).toEqual([
      'pause-auction',
      'set-auction-duration',
      'unpause-auction'
    ]);
    expect(change.bundle?.label).toBe('Change the auction: 3 steps');
    expect(composerChange(setting('set-auction-duration', '600'), [], { auctionPaused: true }).actions).toHaveLength(1);
  });

  it('joins an auction bundle before its resume step, and keeps an edited step in its bundle', async () => {
    const { composerChange } = await import('./composer-change');
    const first = composerChange(setting('set-auction-duration', '600'), []);
    const queued = resolveChange(first, [], [], 'add');
    const joined = composerChange(setting('set-auction-time-buffer', '120'), queued);
    expect(joined.actions.map((entry) => entry.type)).toEqual([
      'pause-auction',
      'set-auction-duration',
      'set-auction-time-buffer',
      'unpause-auction'
    ]);
    const after = resolveChange(joined, queued, reviewChange(joined, queued).findings, 'add');
    expect(after).toHaveLength(4);
    expect(new Set(after.map((entry) => entry.bundleId)).size).toBe(1);
    expect(after[0].bundleLabel).toBe('Change the auction: 4 steps');

    const edit = composerChange(setting('set-auction-duration', '900'), after, { editingId: after[1].id });
    const edited = resolveChange(edit, after, reviewChange(edit, after).findings, 'add');
    expect(edited.map((entry) => entry.value ?? entry.type)).toEqual([
      'pause-auction',
      '900',
      '120',
      'unpause-auction'
    ]);
    expect(new Set(edited.map((entry) => entry.bundleId)).size).toBe(1);
  });
});
