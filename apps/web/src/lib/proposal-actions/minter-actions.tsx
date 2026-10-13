import { CodeBlock, Text } from '@/components/ui';
import { claimListCall, type ClaimListDraft, validateClaimListDraft } from '@/lib/minter/proposal-actions';

import type { ActionHandler } from './types';

type ScopedDraft = ClaimListDraft & { claimsContractId?: string };

/** Open a ClaimMinter claim list. Prepared in Claims admin, queued after its allowance grant. */
export const openClaimListHandler: ActionHandler<ScopedDraft> = {
  type: 'open-claim-list',
  label: 'Open a claim list',
  description: 'Prepare the list in Claims admin: it grants the claims module an allowance and opens the list.',
  group: 'Allocations',
  FormComponent: ({ value }) => (
    <>
      <Text>
        Prepare a claim list in Claims admin. Its full list is published so anyone can check it, and members claim their
        tokens themselves, paying the list price.
      </Text>
      <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>
    </>
  ),
  getDefaultValues: () => ({
    type: 'open-claim-list',
    root: '',
    treeUri: '',
    asset: '',
    price: '0',
    expiresAt: 0,
    total: 0
  }),
  validate: (data, context) => {
    try {
      validateClaimListDraft(data);
      if (!context.config.claimsContractId || data.claimsContractId !== context.config.claimsContractId)
        throw new Error('Prepare a claim list from the verified Claims admin state.');
      return { valid: true };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : 'Invalid claim list.' };
    }
  },
  serialize: (data, context) => ({
    ...data,
    id: crypto.randomUUID(),
    type: 'open-claim-list',
    recipient: '',
    amount: String(data.total),
    claimsContractId: context.config.claimsContractId
  }),
  deserialize: (action) => ({
    type: 'open-claim-list',
    root: action.root,
    treeUri: action.treeUri,
    asset: action.asset,
    price: String(action.price),
    expiresAt: Number(action.expiresAt),
    total: Number(action.total),
    claimsContractId: action.claimsContractId
  }),
  buildCallVector: (data, context) => {
    if (!context.config.claimsContractId || data.claimsContractId !== context.config.claimsContractId)
      throw new Error('The claims module changed; review again.');
    return claimListCall(data, context.config.claimsContractId);
  }
};
