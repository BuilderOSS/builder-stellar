/** Allocation descriptors; shared encoding permits only the canonical registered
 * Minter with its server-discovered, validated spec. */
import { StrKey } from '@stellar/stellar-sdk';
import type { Spec } from '@stellar/stellar-sdk/contract';

import { assertMinterSpec } from './client';
import { claimAmount, hashBytes } from './proof';
import type { ClaimState } from './types';

export type AllocationDraft =
  | { type: 'set-merkle-root'; root: string }
  | { type: 'set-allowlist'; addresses: string[]; amount: string }
  | { type: 'minter-batch-mint'; recipients: string[]; amounts: string[] };

export function validateAllocation(draft: AllocationDraft) {
  if (draft.type === 'set-merkle-root') {
    hashBytes(draft.root);
    return;
  }
  const addresses = draft.type === 'set-allowlist' ? draft.addresses : draft.recipients;
  // The contract limits batch mint to 100. The frontend also caps allowlist input
  // at 100 to bound review size/resource budgets; it is not a contract limit.
  if (!addresses.length || addresses.length > 100) throw new Error('Use 1–100 recipients per reviewed allocation.');
  if (new Set(addresses).size !== addresses.length)
    throw new Error('Duplicate recipients are not supported in this review.');
  for (const address of addresses)
    if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address))
      throw new Error('Invalid allocation recipient.');
  if (draft.type === 'set-allowlist') claimAmount(draft.amount);
  else {
    if (draft.amounts.length !== addresses.length)
      throw new Error('Recipients and amounts must have identical lengths.');
    draft.amounts.forEach(claimAmount);
    // The Token contract returns u32 IDs; simulation must still enforce supply/batch budgets.
  }
}

export function buildAllocationDraft(
  draft: AllocationDraft,
  state: ClaimState,
  deploymentId: string,
  daoId: string,
  treasury: string
) {
  validateAllocation(draft);
  if (
    state.deploymentId !== deploymentId ||
    state.daoId !== daoId ||
    state.tokenContractId !== daoId ||
    !state.live ||
    !state.mintAuthority ||
    !state.minterContractId ||
    !StrKey.isValidContract(state.minterContractId)
  )
    throw new Error('Live allocation identity and mint authority must be verified.');
  if (!treasury || state.admin !== treasury)
    throw new Error('The Treasury must be the current Token admin for a governance allocation.');
  const call =
    draft.type === 'set-merkle-root'
      ? { function: 'set_merkle_root' as const, args: [daoId, draft.root] }
      : draft.type === 'set-allowlist'
        ? { function: 'set_allowlist' as const, args: [daoId, draft.addresses, draft.amount] }
        : { function: 'mint_batch' as const, args: [daoId, draft.recipients, draft.amounts] };
  return { deploymentId, daoId, target: state.minterContractId, ...call, submissionEnabled: true as const };
}

/** Exact current spec encoding adapter for registered allocation proposals.
 * No simulation/submission and no fallback to untyped integer/address encoding. */
export function encodeAllocation(spec: Spec, draft: AllocationDraft, token: string) {
  assertMinterSpec(spec);
  validateAllocation(draft);
  if (!StrKey.isValidContract(token)) throw new Error('Invalid DAO token.');
  if (draft.type === 'set-merkle-root')
    return spec.funcArgsToScVals('set_merkle_root', { token_id: token, root: hashBytes(draft.root) });
  if (draft.type === 'set-allowlist')
    return spec.funcArgsToScVals('set_allowlist', {
      token_id: token,
      addresses: draft.addresses,
      fixed_amount: claimAmount(draft.amount)
    });
  return spec.funcArgsToScVals('mint_batch', {
    token_id: token,
    recipients: draft.recipients,
    amounts: draft.amounts.map(claimAmount)
  });
}
