import { describe, expect, it } from 'vitest';

import { ACTION_SOURCES, type ActionRequest } from './action-request';
import { resolveAction, reviewAction } from './review';
import { action, setting } from './test-fixtures';

const request = (actions: ActionRequest['actions'], extra: Partial<ActionRequest> = {}): ActionRequest => ({
  actions,
  source: ACTION_SOURCES.governance,
  note: 'A note.',
  ...extra
});

describe('reviewing an action', () => {
  it('asks when a setting already in the proposal is set again, and replace swaps it in place', () => {
    const existing = [
      setting('set-quorum-bps', '1000'),
      action('transfer-sac-token', { recipient: 'G1', amount: '5' })
    ];
    const proposed = request([setting('set-quorum-bps', '2000')]);
    const { findings, needsReview } = reviewAction(proposed, existing);
    expect(needsReview).toBe(true);
    expect(findings.find((finding) => finding.kind === 'conflict')?.existingIds).toEqual([existing[0].id]);

    const replaced = resolveAction(proposed, existing, findings, 'replace');
    expect(replaced.map((entry) => entry.value ?? entry.type)).toEqual(['2000', 'transfer-sac-token']);
    expect(replaced[0].source).toEqual(ACTION_SOURCES.governance);
    expect(replaced[0].note).toBe('A note.');

    expect(resolveAction(proposed, existing, findings, 'keep')).toHaveLength(3);
    expect(resolveAction(proposed, existing, findings, 'skip')).toHaveLength(2);
  });

  it('never adds an exact repeat, and ignores where an action came from when comparing', () => {
    const existing = [{ ...setting('set-voting-delay', '600'), source: ACTION_SOURCES.composer, note: 'Older.' }];
    const proposed = request([setting('set-voting-delay', '600')]);
    const { findings } = reviewAction(proposed, existing);
    expect(findings.some((finding) => finding.kind === 'duplicate')).toBe(true);
    expect(resolveAction(proposed, existing, findings, 'keep')).toHaveLength(1);
  });

  it('adds an action with nothing to warn about straight away', () => {
    const { needsReview } = reviewAction(request([setting('set-voting-period', '86400')]), []);
    expect(needsReview).toBe(false);
  });

  it('checks an edit against the proposal without the action it replaces', () => {
    const existing = [setting('set-quorum-bps', '1000')];
    const edit = request([setting('set-quorum-bps', '1500')], { replaces: [existing[0].id] });
    const { findings, needsReview } = reviewAction(edit, existing);
    expect(needsReview).toBe(false);
    const next = resolveAction(edit, existing, findings, 'add');
    expect(next.map((entry) => entry.value)).toEqual(['1500']);
  });

  it('keeps a replaced step inside its bundle', () => {
    const bundle = [action('pause-auction'), setting('set-auction-duration', '600'), action('unpause-auction')].map(
      (entry) => ({ ...entry, bundleId: 'b', bundleLabel: 'Change the auction: 3 steps' })
    );
    const proposed = request([setting('set-auction-duration', '900')]);
    const { findings } = reviewAction(proposed, bundle);
    const next = resolveAction(proposed, bundle, findings, 'replace');
    expect(next.map((entry) => entry.type)).toEqual(['pause-auction', 'set-auction-duration', 'unpause-auction']);
    expect(next[1].value).toBe('900');
    expect(next[1].bundleId).toBe('b');
  });

  it('adds or skips a bundle as one unit', () => {
    const existing = [action('pause-auction')];
    const bundle = request([action('pause-auction'), action('unpause-auction')], {
      bundle: { id: 'b', label: 'Change the auction: 2 steps' }
    });
    const { findings } = reviewAction(bundle, existing);
    expect(resolveAction(bundle, existing, findings, 'skip')).toEqual(existing);
    const kept = resolveAction(bundle, existing, findings, 'keep');
    expect(kept).toHaveLength(3);
    expect(kept.slice(1).every((entry) => entry.bundleId === 'b')).toBe(true);
  });
});

describe('composer actions', () => {
  it('wraps a lone auction setting in pause and resume', async () => {
    const { composerAction } = await import('./composer-action');
    const proposed = composerAction(setting('set-auction-duration', '600'), []);
    expect(proposed.actions.map((entry) => entry.type)).toEqual([
      'pause-auction',
      'set-auction-duration',
      'unpause-auction'
    ]);
    expect(proposed.bundle?.label).toBe('Change the auction: 3 steps');
    expect(composerAction(setting('set-auction-duration', '600'), [], { auctionPaused: true }).actions).toHaveLength(1);
  });

  it('joins an auction bundle before its resume step, and keeps an edited step in its bundle', async () => {
    const { composerAction } = await import('./composer-action');
    const first = composerAction(setting('set-auction-duration', '600'), []);
    const queued = resolveAction(first, [], [], 'add');
    const joined = composerAction(setting('set-auction-time-buffer', '120'), queued);
    expect(joined.actions.map((entry) => entry.type)).toEqual([
      'pause-auction',
      'set-auction-duration',
      'set-auction-time-buffer',
      'unpause-auction'
    ]);
    const after = resolveAction(joined, queued, reviewAction(joined, queued).findings, 'add');
    expect(after).toHaveLength(4);
    expect(new Set(after.map((entry) => entry.bundleId)).size).toBe(1);
    expect(after[0].bundleLabel).toBe('Change the auction: 4 steps');

    const edit = composerAction(setting('set-auction-duration', '900'), after, { editingId: after[1].id });
    const edited = resolveAction(edit, after, reviewAction(edit, after).findings, 'add');
    expect(edited.map((entry) => entry.value ?? entry.type)).toEqual([
      'pause-auction',
      '900',
      '120',
      'unpause-auction'
    ]);
    expect(new Set(edited.map((entry) => entry.bundleId)).size).toBe(1);
  });
});

describe('reviewing an edited bundle', () => {
  it('does not ask again about high-risk steps the proposal already had', async () => {
    const { composerAction } = await import('./composer-action');
    const first = composerAction(setting('set-auction-duration', '600'), []);
    expect(reviewAction(first, []).needsReview).toBe(true);
    const queued = resolveAction(first, [], [], 'add');
    const joined = composerAction(setting('set-auction-time-buffer', '120'), queued);
    expect(reviewAction(joined, queued).needsReview).toBe(false);
  });
});

describe('reviewing an edit from its page', () => {
  it('does not ask again about high-risk kinds the replaced action already had', () => {
    const bundle = [action('pause-auction'), setting('set-auction-duration', '600'), action('unpause-auction')].map(
      (entry) => ({ ...entry, bundleId: 'b', bundleLabel: 'Change the auction: 3 steps' })
    );
    const rebuilt = request(
      [action('pause-auction'), setting('set-auction-duration', '900'), action('unpause-auction')],
      {
        bundle: { id: 'b2', label: 'Change the auction: 3 steps' },
        replaces: [bundle[0].id]
      }
    );
    expect(reviewAction(rebuilt, bundle).needsReview).toBe(false);
    const widened = request([action('pause-auction'), action('cancel-auction'), action('unpause-auction')], {
      bundle: { id: 'b3', label: 'Change the auction: 3 steps' },
      replaces: [bundle[0].id]
    });
    expect(resolveAction(rebuilt, bundle, [], 'add').map((entry) => entry.value ?? entry.type)).toEqual([
      'pause-auction',
      '900',
      'unpause-auction'
    ]);
    expect(widened.actions).toHaveLength(3);
  });
});

describe('whole-draft rules from the contracts', () => {
  it('flags an authorize left as the last action, on its own row and when it is added', async () => {
    const { analyzeQueue } = await import('./review');
    const authorize = action('treasury-authorize', { nodes: [] });
    const queue = [setting('set-quorum-bps', '1000'), authorize];
    const onRow = analyzeQueue(queue).get(authorize.id) ?? [];
    expect(onRow.some((finding) => finding.kind === 'order' && finding.severity === 'error')).toBe(true);
    const { findings } = reviewAction(request([action('treasury-authorize', { nodes: [] })]), [queue[0]]);
    expect(findings.some((finding) => finding.kind === 'order' && finding.severity === 'error')).toBe(true);
  });
});
