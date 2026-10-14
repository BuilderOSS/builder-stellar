import { Networks, TransactionBuilder } from '@stellar/stellar-sdk';

import { SITE_NAME } from '@/lib/site';

/**
 * Fee guard (docs/STORAGE_DIET.md § 8, D29). A fee in the hundreds of XLM means
 * the transaction is paying rent on shared contract code the platform should have
 * renewed (~300 XLM per code entry before D27). Refuse to sign and say so, instead
 * of a silent charge or the SDK's u32 overflow error.
 *
 * The threshold is 50 XLM, not the 10 XLM first planned: testnet rent measured
 * 2026-10-12 is ~0.01 XLM per KB-day, so creating a DAO (six ~1 KB instances
 * extended to 170 days) already costs about 10 XLM. See docs/TTL_ECONOMICS.md.
 */
export const FEE_GUARD_STROOPS = 500_000_000n; // 50 XLM

export class FeeGuardError extends Error {
  constructor(readonly fee: bigint) {
    super(
      `This action would pay about ${formatXlm(fee)} XLM in network fees, most of it to renew shared contract code. ` +
        `${SITE_NAME} renews that code, so nothing was signed. Please report this to the ${SITE_NAME} team.`
    );
    this.name = 'FeeGuardError';
  }
}

function formatXlm(stroops: bigint) {
  const whole = stroops / 10_000_000n;
  const tenths = (stroops % 10_000_000n) / 1_000_000n;
  return `${whole.toLocaleString('en-US')}.${tenths}`;
}

/** The most the transaction can charge, in stroops; null when the XDR is not a transaction. */
export function transactionMaxFee(txXdr: string, networkPassphrase: string = Networks.TESTNET): bigint | null {
  try {
    // The passphrase only matters for hashing; fees parse the same on any network.
    return BigInt(TransactionBuilder.fromXDR(txXdr, networkPassphrase).fee);
  } catch {
    return null;
  }
}

/** Throw FeeGuardError when the transaction could charge more than `limit` stroops. */
export function assertFeeWithinGuard(txXdr: string, networkPassphrase?: string, limit = FEE_GUARD_STROOPS) {
  const fee = transactionMaxFee(txXdr, networkPassphrase);
  if (fee !== null && fee > limit) throw new FeeGuardError(fee);
}
