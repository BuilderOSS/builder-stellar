import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ closeList: vi.fn() }));
vi.mock('./client', () => ({ claimMinterClient: () => ({ close_list: mocks.closeList }) }));

import { getProposalActionIdentity } from '@/lib/proposal-action-identity';
import { inspectProposalAdminCall } from '@/lib/proposal-action-inspection';
import { actionAvailability } from '@/lib/proposal-actions/catalog';
import { CLOSE_LIST_NEEDS_UPGRADE } from '@/lib/proposal-actions/minter-actions';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { FormContext, ProposalQueuedAction } from '@/lib/proposal-actions/types';
import { getProposalActionSummary } from '@/lib/proposal-call';

import { claimMinterCanCloseLists, closeClaimListCall } from './close-list';
import { CLAIMS, config, TOKEN } from './test-fixtures';

const options = { contractId: CLAIMS, rpcUrl: 'https://rpc.example', networkPassphrase: config.passphrase };
const handler = getActionHandler('close-claim-list');
const context = (patch: Partial<FormContext> = {}) =>
  ({ config, session: { address: null, kit: null }, ...patch }) as FormContext;

describe('closing a claim list', () => {
  it('calls close_list on the tribe’s ClaimMinter with the list id', () => {
    expect(closeClaimListCall({ listId: '3' }, CLAIMS)).toEqual({ target: CLAIMS, function: 'close_list', args: [3] });
    expect(() => closeClaimListCall({ listId: '' }, CLAIMS)).toThrow('Choose the claim list');
    expect(() => closeClaimListCall({ listId: '4294967296' }, CLAIMS)).toThrow('Choose the claim list');
    // A list chosen from one ClaimMinter is never closed on another.
    expect(() => closeClaimListCall({ listId: '1', claimsContractId: TOKEN }, CLAIMS)).toThrow('claims module changed');
    expect(() => closeClaimListCall({ listId: '1' }, '')).toThrow('no claims module');
  });

  it('queues the list and the ClaimMinter it was chosen from', () => {
    expect(handler.validate({ listId: '2' }, context())).toEqual({ valid: true });
    expect(handler.validate({ listId: '' }, context())).toMatchObject({ valid: false });
    const action = handler.serialize({ listId: '2' }, context());
    expect(action).toMatchObject({ type: 'close-claim-list', listId: '2', claimsContractId: CLAIMS });
    expect(handler.deserialize(action)).toEqual({ listId: '2', claimsContractId: CLAIMS });
    expect(getProposalActionSummary(action)).toContain('Close claim list 3 (list ID 2)');
  });

  it('treats two closes of one list as the same change', () => {
    const one = handler.serialize({ listId: '2' }, context());
    const again = handler.serialize({ listId: '2' }, context());
    const other = handler.serialize({ listId: '3' }, context());
    const key = (action: ProposalQueuedAction) => getProposalActionIdentity(action).resourceKey;
    expect(key(one)).toBe(key(again));
    expect(key(one)).not.toBe(key(other));
  });

  it('is offered only for a ClaimMinter that has close_list', () => {
    expect(actionAvailability('close-claim-list', config, { claimsCanCloseLists: true })).toEqual({ available: true });
    expect(actionAvailability('close-claim-list', config, { claimsCanCloseLists: false })).toMatchObject({
      available: false,
      fixHref: 'admin/upgrades'
    });
    expect(actionAvailability('close-claim-list', { ...config, claimsContractId: '' }, {})).toMatchObject({
      available: false
    });
    // The form waits for the answer, and refuses an earlier release or an unanswered read.
    const check = handler.checkPreconditions!;
    expect(check(context({ claimsCanCloseLists: true }))).toEqual({ canExecute: true });
    expect(check(context({ claimsCanCloseLists: false }))).toEqual({
      canExecute: false,
      reason: CLOSE_LIST_NEEDS_UPGRADE
    });
    expect(check(context())).toMatchObject({ canExecute: false, loading: true });
    expect(check(context({ claimsCanCloseListsError: true }))).toMatchObject({ canExecute: false });
    expect(check(context({ claimsCanCloseLists: true, config: { ...config, claimsContractId: '' } }))).toMatchObject({
      canExecute: false
    });
  });

  it('reads as a close on the proposal page', () => {
    const inspected = inspectProposalAdminCall(CLAIMS, 'close_list', [2], config);
    expect(inspected?.title).toBe('Close claim list 3');
    expect(inspected?.fields).toEqual([{ label: 'List ID', value: '2' }]);
  });
});

describe('whether the ClaimMinter can close lists', () => {
  it('is true when the simulated call answers, even with a contract error', async () => {
    mocks.closeList.mockResolvedValueOnce({ result: { isErr: () => true } });
    await expect(claimMinterCanCloseLists(options)).resolves.toBe(true);
    mocks.closeList.mockRejectedValueOnce(
      new Error('Transaction simulation failed: "HostError: Error(Contract, #7807)"')
    );
    await expect(claimMinterCanCloseLists(options)).resolves.toBe(true);
    // The probe names a list no ClaimMinter reaches.
    expect(mocks.closeList).toHaveBeenLastCalledWith({ list_id: 0xffffffff });
  });

  it('is false for a release without the function (0.5.0)', async () => {
    mocks.closeList.mockRejectedValueOnce(
      new Error(
        'Transaction simulation failed: "HostError: Error(WasmVm, MissingValue)\n\nEvent log: trying to invoke non-existent contract function"'
      )
    );
    await expect(claimMinterCanCloseLists(options)).resolves.toBe(false);
  });

  it('fails rather than guessing when the RPC cannot answer', async () => {
    mocks.closeList.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(claimMinterCanCloseLists(options)).rejects.toThrow('fetch failed');
  });
});
