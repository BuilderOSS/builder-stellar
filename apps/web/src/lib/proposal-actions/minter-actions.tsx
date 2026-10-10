import { CodeBlock, Text } from '@/components/ui';
import { type AllocationDraft, validateAllocation } from '@/lib/minter/proposal-actions';

import type { ActionHandler } from './types';

type ScopedDraft = AllocationDraft & { tokenContractId?: string; minterContractId?: string };

export const minterAllocationHandlers: ActionHandler<ScopedDraft>[] = (
  ['set-merkle-root', 'set-allowlist', 'minter-batch-mint'] as const
).map((type) => ({
  type,
  label:
    type === 'set-merkle-root'
      ? 'Set Minter Merkle root'
      : type === 'set-allowlist'
        ? 'Replace Minter allowlist'
        : 'Minter batch allocation',
  description:
    'Prepare allocations in Claims Admin after current registration, Token admin, Live state and mint authority are verified.',
  group: 'Allocations',
  FormComponent: ({ value }) => (
    <>
      <Text>
        Prepare this structured allocation in Claims Admin. Replacing a root/list starts a new claim round. Batch
        allocation mints immediately on execution.
      </Text>
      <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>
    </>
  ),
  getDefaultValues: () =>
    type === 'set-merkle-root'
      ? { type, root: '' }
      : type === 'set-allowlist'
        ? { type, addresses: [], amount: '' }
        : { type, recipients: [], amounts: [] },
  validate: (data, context) => {
    try {
      if (data.type !== type) throw new Error('Allocation action type mismatch.');
      validateAllocation(data);
      if (
        !context.config.minterContractId ||
        !context.config.minterSpec?.length ||
        data.tokenContractId !== context.config.tokenContractId ||
        data.minterContractId !== context.config.minterContractId
      )
        throw new Error('Prepare an allocation from verified current Claims Admin state.');
      return { valid: true };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : 'Invalid allocation.' };
    }
  },
  serialize: (data, context) => ({
    ...data,
    id: crypto.randomUUID(),
    type,
    recipient: '',
    amount: data.type === 'set-allowlist' ? data.amount : '',
    tokenContractId: context.config.tokenContractId,
    minterContractId: context.config.minterContractId
  }),
  deserialize: (action) => {
    const scope = { tokenContractId: action.tokenContractId, minterContractId: action.minterContractId };
    if (action.type === 'set-merkle-root') return { ...scope, type: action.type, root: action.root };
    if (action.type === 'set-allowlist')
      return { ...scope, type: action.type, addresses: action.addresses, amount: action.amount };
    if (action.type === 'minter-batch-mint')
      return { ...scope, type: action.type, recipients: action.recipients, amounts: action.amounts };
    throw new Error('Invalid allocation action type.');
  },
  buildCallVector: (data, context) => {
    if (data.type !== type) throw new Error('Allocation action type mismatch.');
    validateAllocation(data);
    if (
      data.tokenContractId !== context.config.tokenContractId ||
      !context.config.minterContractId ||
      data.minterContractId !== context.config.minterContractId
    )
      throw new Error('Allocation DAO or current Minter changed; review again.');
    const args =
      data.type === 'set-merkle-root'
        ? [context.tokenContractId, data.root]
        : data.type === 'set-allowlist'
          ? [context.tokenContractId, data.addresses, data.amount]
          : [context.tokenContractId, data.recipients, data.amounts];
    return {
      target: context.config.minterContractId,
      function:
        data.type === 'set-merkle-root'
          ? 'set_merkle_root'
          : data.type === 'set-allowlist'
            ? 'set_allowlist'
            : 'mint_batch',
      args
    };
  }
}));
