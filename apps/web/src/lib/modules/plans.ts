/**
 * The ordered steps of adding or removing a module (docs/designs/module-attach-ui.md § 5), as plain
 * data: what the review lists, and what the proposal runs. No chain access here; the reads that feed
 * these live in `use-module-reads.ts`.
 */
import type { ProposalActionType } from '@/lib/proposal-actions/types';

import { holdsWithoutVotes, MODULE_COPY, type ModuleConfigs, type ModuleKind, UNLIMITED_ALLOWANCE } from './kinds';

export type PlanStep = {
  type: ProposalActionType;
  /** Input for the action handler's validate and serialize. */
  values: Record<string, unknown>;
  title: string;
  detail: string;
  /** A contract the step names, shown with the Address component after `detail`. */
  address?: string;
};

const SHORT: Record<ModuleKind, string> = { auction: 'auction', marketplace: 'market', claims: 'claims module' };

/**
 * Adding a module after launch. All steps run in one execution, so either every one succeeds or none
 * does. `moduleNumber` and `predicted` come from the Manager (`module_count`, `predict_module_address`):
 * never computed here.
 */
export function buildAttachPlan<K extends ModuleKind>({
  kind,
  config,
  moduleNumber,
  predicted,
  open
}: {
  kind: K;
  config: ModuleConfigs[K];
  moduleNumber: number;
  predicted: string;
  open: boolean;
}): PlanStep[] {
  const noun = MODULE_COPY[kind].noun;
  const spec = config as Partial<{
    paymentAsset: string;
    reservePrice: string;
    duration: string;
    timeBuffer: string;
    feeBps: string;
  }>;
  const steps: PlanStep[] = [
    {
      type: 'create-module',
      values: {
        kind,
        moduleNumber: String(moduleNumber),
        address: predicted,
        paymentAsset: spec.paymentAsset ?? '',
        reservePrice: spec.reservePrice ?? '',
        duration: spec.duration ?? '',
        timeBuffer: spec.timeBuffer ?? '',
        feeBps: spec.feeBps ?? ''
      },
      title: `Deploy ${noun} from the current release`,
      detail: 'It will live at',
      address: predicted
    },
    {
      type: 'register-module',
      values: { kind, address: predicted, nonVoting: holdsWithoutVotes(kind) },
      title: `Register it as your tribe’s ${SHORT[kind]}`,
      detail: holdsWithoutVotes(kind)
        ? 'It holds memberships without votes.'
        : 'It never holds memberships, so it keeps no votes to count.'
    }
  ];
  if (kind === 'auction')
    steps.push({
      type: 'change-mint-allowance',
      values: { module: predicted, amount: String(UNLIMITED_ALLOWANCE), direction: 'increase' },
      title: 'Let it mint one membership per auction',
      detail: 'No limit: each auction mints exactly one.'
    });
  if (open && (kind === 'auction' || kind === 'marketplace'))
    steps.push({
      type: 'open-module',
      values: { kind, address: predicted },
      title: kind === 'auction' ? 'Start the first auction' : 'Open it',
      detail:
        kind === 'auction'
          ? 'The first membership goes up for bids right away.'
          : 'Members can list tokens for resale right away.'
    });
  return steps;
}

export type PoolState = {
  id: string;
  /** Still selling: the Marketplace refuses to sweep a pool until it is closed or has expired. */
  open: boolean;
  /** Memberships minted into the pool and not yet sold or swept. */
  inStock: number;
};

/**
 * Removing a module. `pools` are only the market's pools to clean up, and `cancelAuction` is only
 * for a running auction; each is the person's choice in the checklist.
 */
export function buildDetachPlan({
  kind,
  address,
  pools = [],
  cancelAuction = false
}: {
  kind: ModuleKind;
  address: string;
  pools?: PoolState[];
  cancelAuction?: boolean;
}): PlanStep[] {
  const steps: PlanStep[] = [];
  if (kind === 'marketplace')
    for (const pool of pools) {
      if (pool.open)
        steps.push({
          type: 'close-pool',
          values: { poolId: pool.id },
          title: `Close pool ${pool.id}`,
          detail: 'No more buying from it.'
        });
      if (pool.open || pool.inStock > 0)
        steps.push({
          type: 'sweep-pool',
          values: { poolId: pool.id },
          title: `Sweep pool ${pool.id}`,
          detail: 'Its unsold memberships go back to the treasury.'
        });
    }
  if (kind === 'auction' && cancelAuction)
    steps.push(
      {
        type: 'pause-auction',
        values: {},
        title: 'Pause auctions',
        detail: 'The running auction stops taking bids.'
      },
      {
        type: 'cancel-auction',
        values: {},
        title: 'Cancel the running auction',
        detail: 'Refunds the top bid and sends the token to the treasury.'
      }
    );
  steps.push({
    type: 'unregister-module',
    values: { kind, address },
    title: `Remove ${MODULE_COPY[kind].noun} from your tribe`,
    detail: 'Its mint allowance is cleared with it.',
    address
  });
  return steps;
}

export function actionCount(steps: PlanStep[]) {
  return `${steps.length} ${steps.length === 1 ? 'action' : 'actions'}`;
}
