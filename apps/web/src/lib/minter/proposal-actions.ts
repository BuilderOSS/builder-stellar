/** Claim-list drafts: a ClaimMinter `open_list` call, prepared from verified claims state. */
import { StrKey } from '@stellar/stellar-sdk';

import { claimAmount, hashBytes } from './proof';
import type { ClaimState } from './types';

/** `open_list(root, tree_uri, asset, price, expires_at, total, None)` on the DAO's ClaimMinter. */
export type ClaimListDraft = {
  type: 'open-claim-list';
  root: string;
  treeUri: string;
  /** Payment asset contract; `price` is per token in its smallest unit ("0" for a free list). */
  asset: string;
  price: string;
  /** Unix seconds; claims stop then. */
  expiresAt: number;
  /** Most tokens the list mints, normally the tree's token total. */
  total: number;
};

/** The ClaimMinter accepts an `ipfs://` URI of at most 256 bytes (InvalidTreeUri, 7812). */
export function validTreeUri(value: string) {
  return /^ipfs:\/\/\S+$/.test(value) && new TextEncoder().encode(value).length <= 256;
}

export function validateClaimListDraft(draft: ClaimListDraft, now = Math.floor(Date.now() / 1000)) {
  if (draft.type !== 'open-claim-list') throw new Error('Claim list action type mismatch.');
  hashBytes(draft.root);
  if (!validTreeUri(draft.treeUri)) throw new Error('Publish the claim list first: its ipfs:// address is missing.');
  if (!StrKey.isValidContract(draft.asset)) throw new Error('Choose the asset the list is priced in.');
  if (!/^(0|[1-9]\d{0,37})$/.test(draft.price)) throw new Error('The price must be zero or a whole number of units.');
  if (!Number.isSafeInteger(draft.expiresAt) || draft.expiresAt <= now)
    throw new Error('The list must close in the future.');
  if (!Number.isInteger(draft.total) || draft.total < 1 || draft.total > 0xffffffff)
    throw new Error('A list mints at least one token.');
  claimAmount(String(draft.total));
}

/** The call a proposal (or the launch admin in Setup) makes, after the allowance grant. */
export function claimListCall(draft: ClaimListDraft, claimsContractId: string) {
  validateClaimListDraft(draft);
  if (!StrKey.isValidContract(claimsContractId)) throw new Error('This community has no claims module.');
  return {
    target: claimsContractId,
    function: 'open_list' as const,
    args: [draft.root, draft.treeUri, draft.asset, draft.price, String(draft.expiresAt), draft.total, null]
  };
}

/** Fail closed unless the draft is prepared against the DAO's live, registered ClaimMinter. */
export function assertClaimListScope(state: ClaimState, deploymentId: string, daoId: string, treasury: string) {
  if (
    state.deploymentId !== deploymentId ||
    state.daoId !== daoId ||
    state.tokenContractId !== daoId ||
    !state.claimsContractId ||
    !StrKey.isValidContract(state.claimsContractId)
  )
    throw new Error('The community and its claims module must be verified first.');
  if (state.live && (!treasury || state.admin !== treasury))
    throw new Error('The Treasury must be the current Token admin for a governance claim list.');
}
