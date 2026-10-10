import type { ActionHandler, FormContext } from '@/lib/proposal-actions/types';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

/** Registry presence alone is insufficient: fail closed until the lead has also
 * integrated the target role and ABI. Never infer encoding from a method name. */
export function assertAdminCallSupported(handler: ActionHandler, values: unknown, context: FormContext) {
  const call = handler.buildCallVector(values, {
    config: context.config,
    governorContractId: context.config.governorContractId,
    tokenContractId: context.config.tokenContractId,
    treasuryAddress: context.config.treasuryContractId
  });
  encodeSupportedCall(call.target, call.function, call.args, context.config);
}
