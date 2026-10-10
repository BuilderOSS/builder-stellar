import type { LaunchReadiness } from '@/components/create-dao/launch-readiness';

export type StepStatus = 'done' | 'todo' | 'blocked' | 'loading';

export type LaunchStep = {
  id: 'artwork' | 'founders' | 'slug' | 'contracts';
  title: string;
  status: StepStatus;
  /** One line under the title: what's there, or what to do. */
  detail: string;
  /** A softer hint when the step can be done but shouldn't be yet. */
  caution?: string;
};

export type LaunchBlocker = { id: 'admin' | 'token-admin' | 'assets'; title: string; detail: string };

export type LaunchPlan = {
  live: boolean;
  required: LaunchStep[];
  blockers: LaunchBlocker[];
  doneCount: number;
  /** Required steps that count toward progress (the slug step only appears when it is a problem). */
  totalCount: number;
  canLaunch: boolean;
  /** Why the launch button is disabled, in one short sentence. */
  launchHint: string;
};

type ArtworkState = { properties: Array<{ id: number; count: number }> } | undefined;

const plural = (n: number | bigint, one: string, many: string) => `${n} ${n === 1 || n === 1n ? one : many}`;

/**
 * What a launch admin still has to do, in order, from live chain reads. Required steps are the ones
 * the Manager checks at launch (founder supply, a free slug) plus artwork, which must come before the
 * founder mint because traits are assigned at mint time. System checks that the admin can't fix from
 * a step (admin rights, payment assets) are blockers.
 */
export function buildLaunchPlan({
  readiness,
  artwork,
  launchAdmin,
  withdrawnContracts = 0
}: {
  readiness: LaunchReadiness | undefined;
  artwork: ArtworkState;
  launchAdmin: string;
  /** Modules still on a revoked release: the Manager refuses to launch until they're updated. */
  withdrawnContracts?: number;
}): LaunchPlan {
  if (readiness?.live)
    return {
      live: true,
      required: [],
      blockers: [],
      doneCount: 0,
      totalCount: 0,
      canLaunch: false,
      launchHint: 'This community is already live.'
    };

  const layers = artwork?.properties.length ?? 0;
  const traits = artwork?.properties.reduce((sum, property) => sum + property.count, 0) ?? 0;
  const artworkDone = layers > 0;
  const artworkStep: LaunchStep = {
    id: 'artwork',
    title: 'Add your artwork',
    status: !artwork ? 'loading' : artworkDone ? 'done' : 'todo',
    detail: artworkDone
      ? `${plural(layers, 'layer', 'layers')} · ${plural(traits, 'trait', 'traits')}`
      : 'The layers every token is drawn from. Do this first.'
  };

  const supply = readiness?.supply ?? 0n;
  const foundersDone = supply > 0n;
  const foundersStep: LaunchStep = {
    id: 'founders',
    title: 'Mint founder tokens',
    status: !readiness ? 'loading' : foundersDone ? 'done' : 'todo',
    detail: foundersDone
      ? `${plural(supply, 'token', 'tokens')} minted`
      : 'At least one token, so someone can vote once you launch.',
    caution: !foundersDone && artwork && !artworkDone ? 'Add artwork first so founder tokens get traits.' : undefined
  };

  const required = [artworkStep, foundersStep];
  if (readiness?.slugTaken && readiness.pending)
    required.push({
      id: 'slug',
      title: 'Pick a new link',
      status: 'blocked',
      detail: `Another community launched first with "${readiness.pending.slug}".`
    });

  if (withdrawnContracts > 0)
    required.push({
      id: 'contracts',
      title: 'Upgrade your contracts',
      status: 'blocked',
      detail: `${plural(withdrawnContracts, 'contract is', 'contracts are')} on a withdrawn version. Launch is blocked until they're upgraded.`
    });

  const blockers: LaunchBlocker[] = [];
  if (readiness) {
    if (!readiness.pending || readiness.pending.launch_admin !== launchAdmin)
      blockers.push({
        id: 'admin',
        title: "We couldn't confirm your launch rights",
        detail:
          'The DAO factory has a different launch admin for this community. Refresh, then check you are on the right wallet.'
      });
    if (readiness.admin !== launchAdmin)
      blockers.push({
        id: 'token-admin',
        title: 'Token admin has moved',
        detail: 'The membership token is no longer controlled by the launch admin, so launch would fail.'
      });
    if (readiness.pending && !readiness.paymentAssetsMatch)
      blockers.push({
        id: 'assets',
        title: 'Payment assets changed',
        detail: 'Auctions and the market must use the assets chosen at creation. Restore them before launch.'
      });
  }

  // Fix-up steps (link, contracts) only appear when there is a problem; they don't count as progress.
  const counted = required.filter((step) => step.id !== 'slug' && step.id !== 'contracts');
  const doneCount = counted.filter((step) => step.status === 'done').length;
  const firstOpen = required.find((step) => step.status !== 'done');
  const canLaunch = Boolean(readiness) && !firstOpen && blockers.length === 0;
  const launchHint = !readiness
    ? 'Checking your setup…'
    : firstOpen?.id === 'contracts'
      ? 'Upgrade your contracts first.'
      : firstOpen?.id === 'slug'
        ? 'Pick a new link first.'
        : firstOpen?.id === 'founders'
          ? 'Mint founder tokens first.'
          : firstOpen?.id === 'artwork'
            ? 'Add your artwork first.'
            : blockers.length
              ? 'Fix the problem above first.'
              : '';

  return { live: false, required, blockers, doneCount, totalCount: counted.length, canLaunch, launchHint };
}
