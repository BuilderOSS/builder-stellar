import { describe, expect, it } from 'vitest';

import { moveQueueItem, queuedActionCount, queueItems, removeFromQueue, replaceInQueue } from './queue';
import { action, setting } from './test-fixtures';

const bundled = (bundleId: string, ...actions: ReturnType<typeof action>[]) =>
  actions.map((entry) => ({ ...entry, bundleId, bundleLabel: `Bundle ${bundleId}` }));

describe('queue rows', () => {
  it('groups a bundle’s neighbouring steps into one row and counts it once', () => {
    const quorum = setting('set-quorum-bps', '1000');
    const auction = bundled(
      'b1',
      action('pause-auction'),
      setting('set-auction-duration', '600'),
      action('unpause-auction')
    );
    const pay = action('transfer-sac-token');
    const items = queueItems([quorum, ...auction, pay]);
    expect(items.map((item) => item.key)).toEqual([quorum.id, 'b1', pay.id]);
    expect(items[1].actions).toHaveLength(3);
    expect(items[1].start).toBe(1);
    expect(queuedActionCount([quorum, ...auction, pay])).toBe(3);
  });

  it('moves a whole bundle when its row moves', () => {
    const quorum = setting('set-quorum-bps', '1000');
    const auction = bundled('b2', action('pause-auction'), action('unpause-auction'));
    const moved = moveQueueItem([quorum, ...auction], 1, 0);
    expect(moved.map((entry) => entry.type)).toEqual(['pause-auction', 'unpause-auction', 'set-quorum-bps']);
    expect(moveQueueItem([quorum, ...auction], 0, 5)).toEqual([quorum, ...auction]);
  });

  it('replaces by id in the same place, taking a bundle out as a whole', () => {
    const first = setting('set-voting-delay', '600');
    const auction = bundled(
      'b3',
      action('pause-auction'),
      setting('set-auction-duration', '600'),
      action('unpause-auction')
    );
    const last = action('transfer-sac-token');
    const replacement = bundled('b4', action('pause-auction'), action('unpause-auction'));
    const next = replaceInQueue([first, ...auction, last], [auction[1].id], replacement);
    expect(next.map((entry) => entry.id)).toEqual([first.id, ...replacement.map((entry) => entry.id), last.id]);
    expect(replaceInQueue([first], ['missing'], [last])).toEqual([first, last]);
  });

  it('removes a bundle with any one of its steps', () => {
    const auction = bundled('b5', action('pause-auction'), action('unpause-auction'));
    const pay = action('transfer-sac-token');
    expect(removeFromQueue([...auction, pay], [auction[0].id])).toEqual([pay]);
  });
});
