import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { assertClaimListScope, claimListCall, type ClaimListDraft } from './proposal-actions';
import type { ClaimState } from './types';

/**
 * A claim list as proposal actions: first grant the ClaimMinter a mint allowance for the
 * list's total, then open the list. Both run in one execution, in this order.
 */
export function claimListQueueActions(
  draft: ClaimListDraft,
  state: ClaimState,
  config: DaoNetworkConfig,
  deploymentId: string
): ProposalQueuedAction[] {
  if (state.network !== config.name || state.claimsContractId !== config.claimsContractId)
    throw new Error('The claims module or network changed. Refresh this tribe.');
  assertClaimListScope(state, deploymentId, config.tokenContractId, config.treasuryContractId);
  const call = claimListCall(draft, config.claimsContractId);
  encodeSupportedCall(call.target, call.function, call.args, config);
  const context = { config, session: { address: state.address, kit: null } };
  const steps: Array<[Parameters<typeof getActionHandler>[0], Record<string, unknown>]> = [
    ['change-mint-allowance', { module: config.claimsContractId, amount: String(draft.total), direction: 'increase' }],
    ['open-claim-list', { ...draft, claimsContractId: config.claimsContractId }]
  ];
  return steps.map(([type, values]) => {
    const handler = getActionHandler(type);
    const validation = handler.validate(values, context);
    if (!validation.valid) throw new Error(validation.message);
    return handler.serialize(values, context);
  });
}
