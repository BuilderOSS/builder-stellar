import { describe, expect, it } from 'vitest';

import type { LaunchReadiness } from '@/components/create-dao/launch-readiness';

import { buildLaunchPlan } from './launch-steps';

const ADMIN = `G${'A'.repeat(55)}`;
function readiness(patch: Partial<LaunchReadiness> = {}): LaunchReadiness {
  return {
    pending: { launch_admin: ADMIN, slug: 'lantern-club' } as LaunchReadiness['pending'],
    supply: 0n,
    admin: ADMIN,
    live: false,
    paymentAssetsMatch: true,
    platformMinter: null,
    slugTaken: false,
    ...patch
  };
}
const artwork = (layers: number[]) => ({ properties: layers.map((count, id) => ({ id, count })) });
const statuses = (plan: ReturnType<typeof buildLaunchPlan>) => plan.required.map((step) => [step.id, step.status]);

describe('buildLaunchPlan', () => {
  it('starts with artwork, then founders, and cannot launch', () => {
    const plan = buildLaunchPlan({ readiness: readiness(), artwork: artwork([]), launchAdmin: ADMIN });
    expect(statuses(plan)).toEqual([
      ['artwork', 'todo'],
      ['founders', 'todo']
    ]);
    expect(plan.required[1].caution).toMatch(/artwork first/);
    expect(plan.canLaunch).toBe(false);
    expect(plan.launchHint).toBe('Add your artwork first.');
    expect([plan.doneCount, plan.totalCount]).toEqual([0, 2]);
  });

  it('moves on to founders once artwork is in', () => {
    const plan = buildLaunchPlan({ readiness: readiness(), artwork: artwork([5, 8]), launchAdmin: ADMIN });
    expect(plan.required[0]).toMatchObject({ status: 'done', detail: '2 layers · 13 traits' });
    expect(plan.required[1].caution).toBeUndefined();
    expect(plan.launchHint).toBe('Mint founder tokens first.');
    expect(plan.doneCount).toBe(1);
  });

  it('is ready when both are done and nothing is wrong', () => {
    const plan = buildLaunchPlan({ readiness: readiness({ supply: 3n }), artwork: artwork([5]), launchAdmin: ADMIN });
    expect(plan.required[1].detail).toBe('3 tokens minted');
    expect(plan.canLaunch).toBe(true);
    expect(plan.launchHint).toBe('');
    expect([plan.doneCount, plan.totalCount]).toEqual([2, 2]);
  });

  it('adds a blocked link step when another community took the slug', () => {
    const plan = buildLaunchPlan({
      readiness: readiness({ supply: 1n, slugTaken: true }),
      artwork: artwork([5]),
      launchAdmin: ADMIN
    });
    expect(plan.required.at(-1)).toMatchObject({ id: 'slug', status: 'blocked' });
    expect(plan.canLaunch).toBe(false);
    expect(plan.launchHint).toBe('Pick a new link first.');
    // The slug step doesn't count toward "x of 2" progress.
    expect(plan.totalCount).toBe(2);
  });

  it('blocks with a plain reason when payment assets or admin rights changed', () => {
    const plan = buildLaunchPlan({
      readiness: readiness({ supply: 1n, paymentAssetsMatch: false, admin: 'GOTHER' }),
      artwork: artwork([5]),
      launchAdmin: ADMIN
    });
    expect(plan.blockers.map((blocker) => blocker.id)).toEqual(['token-admin', 'assets']);
    expect(plan.canLaunch).toBe(false);
    expect(plan.launchHint).toBe('Fix the problem above first.');
  });

  it('shows loading until reads arrive, and nothing to do once live', () => {
    const loading = buildLaunchPlan({ readiness: undefined, artwork: undefined, launchAdmin: ADMIN });
    expect(statuses(loading)).toEqual([
      ['artwork', 'loading'],
      ['founders', 'loading']
    ]);
    expect(loading.canLaunch).toBe(false);
    const live = buildLaunchPlan({ readiness: readiness({ live: true }), artwork: artwork([1]), launchAdmin: ADMIN });
    expect(live).toMatchObject({ live: true, required: [], canLaunch: false });
  });
});
