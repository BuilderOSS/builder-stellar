import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { type AllocationDraft, buildAllocationDraft } from './proposal-actions';
import type { ClaimState } from './types';

export function allocationQueueAction(
  draft: AllocationDraft,
  state: ClaimState,
  config: DaoNetworkConfig,
  deploymentId: string
) {
  if (state.network !== config.name || state.minterContractId !== config.minterContractId || !config.minterSpec?.length)
    throw new Error('Current registered Minter/network changed or its ABI is unavailable. Refresh this community.');
  const call = buildAllocationDraft(draft, state, deploymentId, config.tokenContractId, config.treasuryContractId);
  encodeSupportedCall(call.target, call.function, call.args, config);
  const handler = getActionHandler(draft.type);
  const values = { ...draft, tokenContractId: config.tokenContractId, minterContractId: config.minterContractId };
  const context = { config, session: { address: state.address, kit: null } };
  const validation = handler.validate(values, context);
  if (!validation.valid) throw new Error(validation.message);
  return handler.serialize(values, context);
}
