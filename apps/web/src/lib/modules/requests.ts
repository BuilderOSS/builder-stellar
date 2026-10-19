import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { CHANGE_SOURCES, type ChangeRequest, planBundle } from '@/lib/proposal-changes/change-request';

import type { PlanStep } from './plans';

/**
 * A plan as one change: each step through its own handler, so what is added is exactly what the composer
 * would have built, and any step the handler refuses stops the whole plan. Its steps go in as one bundle.
 */
export function planChange({
  steps,
  config,
  address,
  title,
  note
}: {
  steps: PlanStep[];
  config: DaoNetworkConfig;
  address: string | null;
  title: string;
  note: string;
}): ChangeRequest {
  const context = { config, session: { address, kit: null } };
  const actions = steps.map((entry) => {
    const handler = getActionHandler(entry.type);
    const check = handler.validate(entry.values, context);
    if (!check.valid) throw new Error(check.message ?? 'Check the values.');
    return handler.serialize(entry.values, context);
  });
  return { actions, bundle: planBundle(title, actions.length), source: CHANGE_SOURCES.membership, note };
}
