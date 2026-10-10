import { z } from 'zod';

import { decimalToStroops } from '@/lib/auction-values';

import type { TreasuryScope } from './types';

export const fundingAssetSchema = z.enum(['XLM', 'USDC']);
export const fundingSchema = z
  .object({
    assetCode: fundingAssetSchema,
    amount: z
      .string()
      .min(1)
      .max(60)
      .refine((amount) => {
        const units = decimalToStroops(amount);
        return units !== null && units > 0n && units < 1n << 127n;
      }, 'Enter a positive amount with at most seven decimal places.')
  })
  .strict();

/** Group only decimal digits, never convert balances to IEEE-754 numbers. */
export function displayTreasuryBalance(balance: string) {
  if (!/^\d+(?:\.\d{1,7})?$/.test(balance)) throw new Error('Invalid exact treasury balance.');
  const [whole, fraction = ''] = balance.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

export function treasuryPage(params: URLSearchParams) {
  if ([...params.keys()].some((key) => key !== 'page') || params.getAll('page').length > 1)
    throw new Error('Only the page parameter is supported.');
  const page = params.get('page') ?? '0';
  if (!/^(0|[1-9]\d{0,3})$/.test(page) || Number(page) > 1000) throw new Error('Invalid history page.');
  return Number(page);
}

export function assertTreasuryScope(scope: TreasuryScope) {
  if (
    [scope.deploymentId, scope.daoId, scope.treasuryContractId, scope.governorContractId].some(
      (value) => !value?.trim()
    )
  )
    throw new Error('Missing treasury identity.');
}

export function assertTreasuryIdentity(actual: TreasuryScope, expected: TreasuryScope) {
  assertTreasuryScope(expected);
  if (
    actual.deploymentId !== expected.deploymentId ||
    actual.daoId !== expected.daoId ||
    actual.treasuryContractId !== expected.treasuryContractId ||
    actual.governorContractId !== expected.governorContractId
  )
    throw new Error('Treasury response identity mismatch. Reload this community.');
}
