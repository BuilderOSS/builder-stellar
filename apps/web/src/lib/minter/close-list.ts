/** Closing a claim list early: ClaimMinter `close_list(list_id)`, by proposal once the tribe is Live. */
import { StrKey } from '@stellar/stellar-sdk';

import { isMissingFunction } from '@/lib/vote-source';

import { claimMinterClient } from './client';

/** A list id no ClaimMinter reaches: `next_list_id` is a u32 counter, so the last id is never used. */
const PROBE_LIST_ID = 0xffffffff;

export type CloseClaimListDraft = {
  /** The list's id on chain (the claims page names it "Claim list {listId + 1}"). */
  listId: string;
  /** The ClaimMinter the list was chosen from; the call fails closed if the tribe's changes. */
  claimsContractId?: string;
};

/** A list id as the ClaimMinter takes it (u32), or null. */
export function closeListId(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const id = Number(text);
  return id <= 0xffffffff ? id : null;
}

/** The call a proposal makes: `close_list(list_id)` on the tribe's ClaimMinter. */
export function closeClaimListCall(draft: CloseClaimListDraft, claimsContractId: string) {
  const listId = closeListId(draft.listId);
  if (listId === null) throw new Error('Choose the claim list to close.');
  if (!StrKey.isValidContract(claimsContractId)) throw new Error('This tribe has no claims module.');
  // A draft made against one ClaimMinter never runs against another.
  if (draft.claimsContractId && draft.claimsContractId !== claimsContractId)
    throw new Error('The claims module changed; choose the list again.');
  return { target: claimsContractId, function: 'close_list' as const, args: [listId] };
}

/**
 * Whether the tribe's ClaimMinter has `close_list`. Releases up to 0.5.0 don't, so the app offers
 * the action only once the module is upgraded. Like `votes_needed_to_propose` in
 * lib/proposal-eligibility.ts, the answer comes from calling it: the call is simulated only, never
 * signed or sent, and names a list that cannot exist. A ClaimMinter with the function answers with a
 * contract error (ListNotFound); one without it fails as a missing function.
 */
export async function claimMinterCanCloseLists(options: {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  allowHttp?: boolean;
}): Promise<boolean> {
  try {
    const tx = await claimMinterClient(options).close_list({ list_id: PROBE_LIST_ID });
    void tx.result;
    return true;
  } catch (error) {
    if (isMissingFunction(error)) return false;
    const message = error instanceof Error ? error.message : String(error);
    if (/Error\(Contract, #\d+\)/.test(message)) return true;
    throw error;
  }
}
