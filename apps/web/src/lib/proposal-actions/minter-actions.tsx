import { Stack } from 'styled-system/jsx';

import { ButtonLink, Callout, CodeBlock, Disclosure, FieldHelperText, FieldLabel, Select, Text } from '@/components/ui';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { getConfiguredAuctionNetwork } from '@/lib/auction-values';
import { daoRoute } from '@/lib/dao-routes';
import { closeClaimListCall, type CloseClaimListDraft, closeListId } from '@/lib/minter/close-list';
import { claimListEndText, claimPriceLabel, formatClaimDate } from '@/lib/minter/display';
import { useOpenClaimLists } from '@/lib/minter/hooks';
import type { OpenClaimList } from '@/lib/minter/open-lists';
import { claimListCall, type ClaimListDraft, validateClaimListDraft } from '@/lib/minter/proposal-actions';

import type { ActionFormProps, ActionHandler, FormContext, PreconditionResult } from './types';

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
        {BigInt(value.price || '0') === 0n ? '' : ` at ${claimPriceLabel(network, value)}`}
        {formatClaimDate(value.expiresAt)
          ? `, open until ${formatClaimDate(value.expiresAt)}`
          : ', with no closing date'}
        . Listed people claim their tokens themselves; paid claims go to the treasury.
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

/** "Claim list 3", or "Launch drive", as the claims page names lists. */
export function claimListName(list: { listId: number; isAssurance?: boolean }) {
  return list.isAssurance ? 'Launch drive' : `Claim list ${list.listId + 1}`;
}

function openListLabel(list: OpenClaimList, network: Parameters<typeof claimPriceLabel>[0]) {
  const left = Math.max(0, list.total - list.claimed);
  return `${claimListName(list)} · ${claimPriceLabel(network, list)} · ${left.toLocaleString()} of ${list.total.toLocaleString()} unclaimed · ${claimListEndText(list.expiresAt)}${list.openedInSetup && !list.isAssurance ? ' · opened in setup' : ''}`;
}

/** Choose one of the tribe's open claim lists, read from the index. */
function CloseClaimListForm({
  value,
  onChange,
  disabled,
  validationErrors,
  network = getConfiguredAuctionNetwork()
}: ActionFormProps<CloseClaimListDraft>) {
  const config = useOptionalDaoContext()?.daoConfig;
  const open = useOpenClaimLists(config?.tokenContractId ?? '', Boolean(config?.claimsContractId));
  const lists = open.data?.lists ?? [];
  const chosen = closeListId(value.listId);
  // A draft can name a list the index no longer lists as open (it closed, or the draft is older).
  const missing = chosen !== null && !lists.some((list) => list.listId === chosen);
  const error = validationErrors && !validationErrors.valid ? validationErrors.fields?.listId : undefined;
  return (
    <Stack gap="2">
      <FieldLabel htmlFor="close-claim-list">Claim list</FieldLabel>
      <Select
        id="close-claim-list"
        value={chosen === null ? '' : String(chosen)}
        onChange={(event) => onChange({ ...value, listId: event.target.value })}
        disabled={disabled || open.isLoading}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby="close-claim-list-hint"
      >
        <option value="">{open.isLoading ? 'Loading open lists…' : 'Choose a list'}</option>
        {missing ? <option value={String(chosen)}>{claimListName({ listId: chosen })}</option> : null}
        {lists.map((list) => (
          <option key={list.listId} value={String(list.listId)}>
            {openListLabel(list, network)}
          </option>
        ))}
      </Select>
      {error ? <FieldHelperText tone="error">{error}</FieldHelperText> : null}
      {open.error ? (
        <Callout variant="warning" title="Open claim lists could not be loaded" description={open.error.message} />
      ) : !open.isLoading && open.data && !lists.length ? (
        <Text size="sm">This tribe has no open claim lists.</Text>
      ) : null}
      <FieldHelperText id="close-claim-list-hint">
        Claims on this list stop when the proposal runs. Tokens already claimed stay with their holders; the rest can no
        longer be minted from this list. If the list has ended by then, this action fails and the proposal does not run.
      </FieldHelperText>
    </Stack>
  );
}

/** Whether the composer can offer the close: only for a ClaimMinter that has `close_list`. */
function closeListPrecondition(context: FormContext): PreconditionResult {
  if (!context.config.claimsContractId) return { canExecute: false, reason: 'This tribe has no claims module.' };
  if (context.claimsCanCloseLists === true) return { canExecute: true };
  if (context.claimsCanCloseLists === false) return { canExecute: false, reason: CLOSE_LIST_NEEDS_UPGRADE };
  if (context.claimsCanCloseListsError)
    return {
      canExecute: false,
      reason: 'We could not check whether the claims module can close lists. Refresh the page to try again.'
    };
  return { canExecute: false, reason: 'Checking the claims module…', loading: true };
}

/** Releases up to 0.5.0 have no `close_list`. */
export const CLOSE_LIST_NEEDS_UPGRADE =
  'This tribe’s claims module is an earlier release that cannot close lists. Upgrade it in Manage → Contract upgrades first.';

/** Close a ClaimMinter claim list early, by proposal. */
export const closeClaimListHandler: ActionHandler<CloseClaimListDraft> = {
  type: 'close-claim-list',
  label: 'Close a claim list',
  description: 'Stop claims on one of the tribe’s claim lists now. Unclaimed tokens on it can no longer be minted.',
  group: 'Membership',
  FormComponent: CloseClaimListForm,
  getDefaultValues: () => ({ listId: '' }),
  validate: (data, context) => {
    if (closeListId(data.listId) === null) {
      const message = 'Choose the claim list to close.';
      return { valid: false, message, fields: { listId: message } };
    }
    if (!context.config.claimsContractId) return { valid: false, message: 'This tribe has no claims module.' };
    if (data.claimsContractId && data.claimsContractId !== context.config.claimsContractId)
      return { valid: false, message: 'The claims module changed; choose the list again.' };
    return { valid: true };
  },
  serialize: (data, context) => ({
    id: crypto.randomUUID(),
    type: 'close-claim-list',
    recipient: '',
    amount: '',
    listId: String(closeListId(data.listId) ?? ''),
    claimsContractId: data.claimsContractId || context.config.claimsContractId
  }),
  deserialize: (action) => ({ listId: String(action.listId ?? ''), claimsContractId: action.claimsContractId }),
  buildCallVector: (data, context) => closeClaimListCall(data, context.config.claimsContractId),
  checkPreconditions: closeListPrecondition
};
