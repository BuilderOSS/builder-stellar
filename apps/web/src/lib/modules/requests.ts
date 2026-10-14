import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { AdminProposalRequest } from '@/lib/use-admin-proposal-draft';

import type { PlanStep } from './plans';

/**
 * A plan as the requests the draft takes: each step through its own handler, so what is added is
 * exactly what the composer would have built, and any step the handler refuses stops the whole batch.
 */
export function planRequests({
  steps,
  config,
  address,
  daoId,
  title,
  description
}: {
  steps: PlanStep[];
  config: DaoNetworkConfig;
  address: string | null;
  daoId: string;
  title: string;
  description: string;
}): AdminProposalRequest[] {
  const context = { config, session: { address, kit: null } };
  return steps.map((entry) => {
    const handler = getActionHandler(entry.type);
    const check = handler.validate(entry.values, context);
    if (!check.valid) throw new Error(check.message ?? 'Check the values.');
    return {
      daoId,
      action: handler.serialize(entry.values, context),
      source: `admin/membership/modules/${entry.type}`,
      metadata: { title, description, url: '' }
    };
  });
}
