import { ButtonLink, CodeBlock, Disclosure, Text } from '@/components/ui';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { getConfiguredAuctionNetwork } from '@/lib/auction-values';
import { daoRoute } from '@/lib/dao-routes';
import { claimPriceLabel, formatClaimDate } from '@/lib/minter/display';
import { claimListCall, type ClaimListDraft, validateClaimListDraft } from '@/lib/minter/proposal-actions';

import type { ActionFormProps, ActionHandler } from './types';

type ScopedDraft = ClaimListDraft & { claimsContractId?: string };

/** The list in words; the raw draft stays under Technical details. Lists are prepared in Claims admin. */
function ClaimListSummary({ value, network = getConfiguredAuctionNetwork() }: ActionFormProps<ScopedDraft>) {
  const routeId = useOptionalDaoContext()?.routeId;
  if (!value.total)
    return (
      <>
        <Text>
          Prepare a claim list in Manage → Claims. It publishes the full list so anyone can check it, then adds this
          action to your proposal for you, after the allowance it needs.
        </Text>
        {routeId ? (
          <div>
            <ButtonLink href={daoRoute(routeId, 'admin/claims')} variant="secondary" size="sm">
              Prepare a claim list
            </ButtonLink>
          </div>
        ) : null}
      </>
    );
  return (
    <>
      <Text>
        Opens {BigInt(value.price || '0') === 0n ? 'a free list' : 'a list'} of {value.total.toLocaleString()}{' '}
        {value.total === 1 ? 'token' : 'tokens'}
        {BigInt(value.price || '0') === 0n ? '' : ` at ${claimPriceLabel(network, value)}`}, open until{' '}
        {formatClaimDate(value.expiresAt)}. Listed people claim their tokens themselves; paid claims go to the treasury.
      </Text>
      <Disclosure title="Technical details">
        <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>
      </Disclosure>
    </>
  );
}

/** Open a ClaimMinter claim list. Prepared in Claims admin, queued after its allowance grant. */
export const openClaimListHandler: ActionHandler<ScopedDraft> = {
  type: 'open-claim-list',
  label: 'Open a claim list',
  description: 'Prepare the list in Claims admin: it grants the claims module an allowance and opens the list.',
  group: 'Membership',
  FormComponent: ClaimListSummary,
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
