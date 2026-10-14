import { StrKey } from '@stellar/stellar-sdk';

import {
  type AdminPaymentTokenDraft,
  AdminPaymentTokenForm,
  type AdminReservePriceDraft,
  AdminReservePriceForm,
  type AdminValueDraft,
  adminValueFormWithHint,
  type OpenPoolDraft,
  OpenPoolForm,
  type PoolIdDraft,
  PoolIdForm,
  ResaleFeeForm
} from '@/components/admin/admin-action-forms';
import { decimalToStroops, validateReservePrice } from '@/lib/auction-values';
import {
  MAX_MARKETPLACE_FEE_BPS,
  validateAuctionTimeBuffer,
  validateProposalThreshold,
  validateQueueDelay,
  validateQuorumBps,
  validateVotingDelay,
  validateVotingPeriod
} from '@/lib/governance-limits';
import { feeBpsFromPercent, feePercentText } from '@/lib/marketplace/amount';
import { marketplaceAsset, marketplaceAssetCodes } from '@/lib/marketplace/readiness';
import { getStellarAddressError, isValidStellarAddress } from '@/lib/validation';

import type { ActionHandler, ValidationResult } from './types';

type EmptyDraft = Record<string, never>;

/** What the picker and summaries call a setting change, and what its field and errors call the value. */
type SettingCopy = {
  label: string;
  /** The value's name in validation messages: "Voting delay must be a whole number." */
  field: string;
  description: string;
  /** Unit hint under the value input. */
  hint: string;
};

function valid(): ValidationResult {
  return { valid: true };
}

function required(value: string, field: string, label: string): ValidationResult {
  return value.trim()
    ? valid()
    : { valid: false, message: `${label} is required.`, fields: { [field]: `${label} is required.` } };
}

function wholeNumber(value: string, label: string): ValidationResult {
  if (!/^\d+$/.test(value.trim())) {
    return {
      valid: false,
      message: `${label} must be a whole number.`,
      fields: { value: `${label} must be a whole number.` }
    };
  }
  return valid();
}

/** datetime-local string (local time) -> unix seconds, or null when unparseable. */
export function parseExpiryToUnixSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = new Date(trimmed).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function decimalPrice(value: string): ValidationResult {
  const error = validateReservePrice(value);
  if (error) {
    return {
      valid: false,
      message: error,
      fields: { reservePrice: error }
    };
  }
  return valid();
}

function settingHandler(
  type: 'set-voting-delay' | 'set-voting-period' | 'set-queue-delay' | 'set-proposal-threshold' | 'set-quorum-bps',
  { label, field, description, hint }: SettingCopy,
  functionName: string,
  limitCheck: (value: number | bigint) => string | null
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description,
    group: 'Administration',
    FormComponent: adminValueFormWithHint(hint),
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => {
      const whole = wholeNumber(data.value, field);
      if (!whole.valid) return whole;
      // Contract bounds: timings 300..=2_592_000s, quorum 1..=10_000 bps, threshold >= 1 vote (absolute).
      const limitError = limitCheck(
        type === 'set-proposal-threshold' ? BigInt(data.value.trim()) : Number(data.value.trim())
      );
      return limitError ? { valid: false, message: limitError, fields: { value: limitError } } : valid();
    },
    serialize: (data) => ({
      id: crypto.randomUUID(),
      type,
      recipient: '',
      amount: data.value.trim(),
      value: data.value.trim()
    }),
    deserialize: (action) => ({ value: action.value || action.amount || '' }),
    buildCallVector: (data, context) => ({
      target: context.governorContractId,
      function: functionName,
      // Governor setters no longer take a caller argument; they run as the Treasury via treasury.execute.
      args: [type === 'set-proposal-threshold' ? data.value.trim() : Number(data.value.trim())]
    })
  };
}

function auctionDurationHandler(
  type: 'set-auction-duration' | 'set-auction-time-buffer',
  { label, field, description, hint }: SettingCopy,
  functionName: 'set_duration' | 'set_time_buffer',
  minimum: number,
  limitCheck?: (seconds: number) => string | null
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description,
    group: 'Administration',
    FormComponent: adminValueFormWithHint(hint),
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => {
      const parsed = Number(data.value.trim());
      if (!/^\d+$/.test(data.value.trim()) || !Number.isSafeInteger(parsed)) {
        return {
          valid: false,
          message: `${field} must be a whole number.`,
          fields: { value: `${field} must be a whole number.` }
        };
      }
      if (parsed < minimum) {
        return {
          valid: false,
          message: `${field} must be at least ${minimum} seconds.`,
          fields: { value: `${field} must be at least ${minimum} seconds.` }
        };
      }
      const limitError = limitCheck?.(parsed);
      if (limitError) return { valid: false, message: limitError, fields: { value: limitError } };
      return valid();
    },
    serialize: (data) => ({
      id: crypto.randomUUID(),
      type,
      recipient: '',
      amount: data.value.trim(),
      value: data.value.trim()
    }),
    deserialize: (action) => ({ value: action.value || action.amount || '' }),
    buildCallVector: (data, context) => ({
      target: context.config.auctionContractId,
      function: functionName,
      args: [Number(data.value.trim())]
    })
  };
}

// Labels match the proposal page (contract-call-labels.ts) so a change reads the same before and after it's proposed.
export const setVotingDelayHandler = settingHandler(
  'set-voting-delay',
  {
    label: 'Change the wait before voting opens',
    field: 'Voting delay',
    description: 'How long after a proposal is made before members can vote',
    hint: 'In seconds.'
  },
  'set_voting_delay',
  (value) => validateVotingDelay(Number(value))
);
export const setVotingPeriodHandler = settingHandler(
  'set-voting-period',
  {
    label: 'Change how long voting stays open',
    field: 'Voting period',
    description: 'How long members have to vote on a proposal',
    hint: 'In seconds.'
  },
  'set_voting_period',
  (value) => validateVotingPeriod(Number(value))
);
export const setProposalThresholdHandler = settingHandler(
  'set-proposal-threshold',
  {
    label: 'Change the votes needed to propose',
    field: 'Proposal threshold',
    description: 'How many votes someone needs to make a proposal',
    hint: 'In votes, at least 1.'
  },
  'set_proposal_threshold',
  (value) => validateProposalThreshold(value)
);
export const setQuorumBpsHandler = settingHandler(
  'set-quorum-bps',
  {
    label: 'Change the quorum',
    field: 'Quorum',
    description: 'Share of all votes that must be For or Abstain for a proposal to pass',
    hint: 'In basis points: 1000 is 10%.'
  },
  'set_quorum_bps',
  (value) => validateQuorumBps(Number(value))
);
export const setQueueDelayHandler = settingHandler(
  'set-queue-delay',
  {
    label: 'Change the safety delay',
    field: 'Safety delay',
    description: 'How long a passed proposal waits after it’s queued before it can run',
    hint: 'In seconds.'
  },
  'set_queue_delay',
  (value) => validateQueueDelay(Number(value))
);
export const setAuctionDurationHandler = auctionDurationHandler(
  'set-auction-duration',
  {
    label: 'Change how long each auction runs',
    field: 'Auction duration',
    description: 'How long each auction stays open for bids',
    hint: 'In seconds, at least 300.'
  },
  'set_duration',
  300,
  (seconds) => (seconds > 2_592_000 ? 'Auction duration cannot exceed 30 days.' : null)
);
export const setAuctionTimeBufferHandler = auctionDurationHandler(
  'set-auction-time-buffer',
  {
    label: 'Change how much time a late bid adds',
    field: 'Late-bid extension',
    description: 'How much time a bid near the end adds to the auction',
    hint: 'In seconds.'
  },
  'set_time_buffer',
  1,
  validateAuctionTimeBuffer
);

function emptyAuctionHandler(
  type: 'pause-auction' | 'unpause-auction',
  label: string,
  description: string
): ActionHandler<EmptyDraft> {
  return {
    type,
    label,
    description,
    group: 'Administration',
    FormComponent: () => null,
    getDefaultValues: () => ({}),
    validate: () => valid(),
    serialize: () => ({ id: crypto.randomUUID(), type, recipient: '', amount: '' }),
    deserialize: () => ({}),
    buildCallVector: (_data, context) => ({
      target: context.config.auctionContractId,
      function: type === 'pause-auction' ? 'pause' : 'unpause',
      args: [context.treasuryAddress]
    })
  };
}

export const pauseAuctionHandler = emptyAuctionHandler(
  'pause-auction',
  'Pause auctions',
  'Stop auctions until a vote resumes them'
);
export const unpauseAuctionHandler = emptyAuctionHandler(
  'unpause-auction',
  'Resume auctions',
  'Start auctions again, with any new settings'
);

export const setAuctionReservePriceHandler: ActionHandler<AdminReservePriceDraft> = {
  type: 'set-auction-reserve-price',
  label: 'Change the starting price',
  description: 'Change the lowest opening bid while auctions are paused',
  group: 'Administration',
  FormComponent: AdminReservePriceForm,
  getDefaultValues: () => ({ reservePrice: '' }),
  validate: (data) => decimalPrice(data.reservePrice),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'set-auction-reserve-price',
    recipient: '',
    amount: data.reservePrice.trim(),
    reservePrice: data.reservePrice.trim()
  }),
  deserialize: (action) => ({ reservePrice: action.reservePrice || action.amount || '' }),
  buildCallVector: (data, context) => ({
    target: context.config.auctionContractId,
    function: 'set_reserve_price',
    args: [decimalToStroops(data.reservePrice)?.toString() ?? '0']
  })
};

export const setAuctionPaymentTokenHandler: ActionHandler<AdminPaymentTokenDraft> = {
  type: 'set-auction-payment-token',
  label: 'Change the auction payment asset',
  description: 'Change the asset bids are paid in while auctions are paused',
  group: 'Administration',
  FormComponent: AdminPaymentTokenForm,
  getDefaultValues: () => ({ paymentToken: '' }),
  validate: (data) => {
    const requiredResult = required(data.paymentToken, 'paymentToken', 'Payment token contract address');
    if (!requiredResult.valid) return requiredResult;
    if (!isValidStellarAddress(data.paymentToken.trim())) {
      const message = getStellarAddressError(data.paymentToken.trim()) ?? 'Invalid payment token contract address';
      return { valid: false, message, fields: { paymentToken: message } };
    }
    return valid();
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'set-auction-payment-token',
    recipient: data.paymentToken.trim(),
    amount: '',
    paymentToken: data.paymentToken.trim()
  }),
  deserialize: (action) => ({ paymentToken: action.paymentToken || action.recipient || '' }),
  buildCallVector: (data, context) => ({
    target: context.config.auctionContractId,
    function: 'set_payment_token',
    args: [data.paymentToken.trim()]
  })
};

// Registry action IDs describe the UI intent; method names must match the current spec.
export const setMarketplacePaymentTokenHandler: ActionHandler<AdminPaymentTokenDraft> = {
  ...setAuctionPaymentTokenHandler,
  type: 'set-marketplace-payment-token',
  label: 'Change the market payment asset',
  description: 'Change the asset buyers pay in. Open listings keep the asset they were listed in.',
  validate: (data, context) => {
    const result = setAuctionPaymentTokenHandler.validate(data, context);
    if (!result.valid) return result;
    return StrKey.isValidContract(data.paymentToken.trim())
      ? valid()
      : {
          valid: false,
          message: 'Payment asset must be a contract address.',
          fields: { paymentToken: 'Payment asset must be a contract address.' }
        };
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'set-marketplace-payment-token',
    recipient: data.paymentToken.trim(),
    amount: '',
    paymentToken: data.paymentToken.trim()
  }),
  buildCallVector: (data, context) => ({
    target: context.config.marketplaceContractId,
    function: 'set_payment_asset',
    args: [data.paymentToken.trim()]
  })
};

function boundedModuleValueHandler(
  type: 'set-marketplace-secondary-fee' | 'set-auction-min-bid-increment',
  { label, field, description, hint }: SettingCopy,
  minimum: number,
  maximum: number
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description,
    group: 'Administration',
    FormComponent: adminValueFormWithHint(hint),
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => {
      const parsed = Number(data.value.trim());
      return /^\d+$/.test(data.value.trim()) && Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? valid()
        : {
            valid: false,
            message: `${field} must be a whole number between ${minimum} and ${maximum}.`,
            fields: { value: `${minimum}–${maximum} required.` }
          };
    },
    serialize: (data) => ({
      id: crypto.randomUUID(),
      type,
      recipient: '',
      amount: data.value.trim(),
      value: data.value.trim()
    }),
    deserialize: (action) => ({ value: action.value || action.amount || '' }),
    buildCallVector: (data, context) => ({
      target:
        type === 'set-marketplace-secondary-fee'
          ? context.config.marketplaceContractId
          : context.config.auctionContractId,
      function: type === 'set-marketplace-secondary-fee' ? 'set_secondary_fee_bps' : 'set_min_bid_increment',
      args: [Number(data.value.trim())]
    })
  };
}

const resaleFeeBpsHandler = boundedModuleValueHandler(
  'set-marketplace-secondary-fee',
  {
    label: 'Change the resale fee',
    field: 'Resale fee',
    description: 'Change the fee on each resale in the market',
    // ResaleFeeForm replaces the base form, so the field takes a percent, not basis points.
    hint: `In percent, up to ${feePercentText(MAX_MARKETPLACE_FEE_BPS)}%.`
  },
  0,
  MAX_MARKETPLACE_FEE_BPS
);
const RESALE_FEE_ERROR = `Enter a fee from 0% to ${feePercentText(MAX_MARKETPLACE_FEE_BPS)}%, with at most two decimals.`;

/** The percent typed in the form as the basis-point draft the call and the queued action use. */
function resaleFeeBpsDraft(data: AdminValueDraft): AdminValueDraft {
  // An empty draft still names its target, which is how the market finds its setting handlers.
  if (!data.value.trim()) return { value: '' };
  const bps = feeBpsFromPercent(data.value);
  if (bps === null) throw new Error(RESALE_FEE_ERROR);
  return { value: String(bps) };
}

// The market shows its fee as a percent, so the form takes one; the call and the queued action keep basis points.
export const setMarketplaceSecondaryFeeHandler: ActionHandler<AdminValueDraft> = {
  ...resaleFeeBpsHandler,
  FormComponent: ResaleFeeForm,
  validate: (data) =>
    feeBpsFromPercent(data.value) === null
      ? { valid: false, message: RESALE_FEE_ERROR, fields: { value: RESALE_FEE_ERROR } }
      : valid(),
  serialize: (data, context) => resaleFeeBpsHandler.serialize(resaleFeeBpsDraft(data), context),
  deserialize: (action) => {
    const bps = resaleFeeBpsHandler.deserialize(action).value.trim();
    return { value: /^\d+$/.test(bps) ? feePercentText(Number(bps)) : '' };
  },
  buildCallVector: (data, context) => resaleFeeBpsHandler.buildCallVector(resaleFeeBpsDraft(data), context)
};
export const setAuctionMinBidIncrementHandler = boundedModuleValueHandler(
  'set-auction-min-bid-increment',
  {
    label: 'Change the minimum bid increase',
    field: 'Minimum bid increase',
    description: 'Change how much higher each new bid must be than the last',
    hint: 'In percent, 1 to 100.'
  },
  1,
  100
);

function emptyModuleHandler(
  type: 'pause-marketplace' | 'unpause-marketplace' | 'cancel-auction',
  label: string,
  description: string
): ActionHandler<EmptyDraft> {
  return {
    type,
    label,
    description,
    group: 'Administration',
    FormComponent: () => null,
    getDefaultValues: () => ({}),
    validate: () => valid(),
    serialize: () => ({ id: crypto.randomUUID(), type, recipient: '', amount: '' }),
    deserialize: () => ({}),
    buildCallVector: (_data, context) => ({
      target: type === 'cancel-auction' ? context.config.auctionContractId : context.config.marketplaceContractId,
      function: type === 'cancel-auction' ? 'cancel_auction' : type === 'pause-marketplace' ? 'pause' : 'unpause',
      args: []
    })
  };
}

export const pauseMarketplaceHandler = emptyModuleHandler(
  'pause-marketplace',
  'Pause the market',
  'Stop sales in the market until a vote reopens it'
);
export const unpauseMarketplaceHandler = emptyModuleHandler(
  'unpause-marketplace',
  'Reopen the market',
  'Let sales in the market start again'
);
export const cancelAuctionHandler = emptyModuleHandler(
  'cancel-auction',
  'Cancel the current auction',
  'Refunds the top bid and sends the token to the treasury. Auctions must be paused first.'
);

// Quick-buy pools (docs/designs/membership-models.md § 4): after launch the Treasury is the
// marketplace admin, so opening, closing and sweeping a pool are proposal actions. A pool reserves
// part of the marketplace's mint allowance, so the proposal grants that allowance first.
const U32_MAX = 0xffffffff;

function positiveCount(value: string, field: string, label: string): ValidationResult | null {
  return /^[1-9]\d*$/.test(value.trim()) && Number(value.trim()) <= U32_MAX
    ? null
    : {
        valid: false,
        message: `${label} must be a whole number above zero.`,
        fields: { [field]: `${label} must be a whole number above zero.` }
      };
}

export const openPoolHandler: ActionHandler<OpenPoolDraft> = {
  type: 'open-pool',
  label: 'Open a quick-buy pool',
  description: 'Sell newly minted tokens at a fixed price, with per-wallet and per-period limits',
  group: 'Membership',
  FormComponent: OpenPoolForm,
  getDefaultValues: () => ({
    price: '',
    asset: '',
    size: '',
    maxPerBuyer: '1',
    maxSoldPerPeriod: '',
    periodHours: '24',
    expiresAt: ''
  }),
  validate: (data, context) => {
    const priceError = validateReservePrice(data.price);
    if (priceError) return { valid: false, message: priceError, fields: { price: priceError } };
    // The market can only take XLM or USDC, so a pool priced in anything else could never sell.
    if (!marketplaceAsset(context.config.name, data.asset.trim())) {
      const message = `Choose the asset buyers pay in: ${marketplaceAssetCodes(context.config.name)}.`;
      return { valid: false, message, fields: { asset: message } };
    }
    const counts =
      positiveCount(data.size, 'size', 'Pool size') ??
      positiveCount(data.maxPerBuyer, 'maxPerBuyer', 'Per-wallet limit') ??
      positiveCount(data.maxSoldPerPeriod, 'maxSoldPerPeriod', 'Sales per period') ??
      positiveCount(data.periodHours, 'periodHours', 'Period');
    if (counts) return counts;
    const expiresAt = parseExpiryToUnixSeconds(data.expiresAt);
    if (expiresAt === null || expiresAt <= Math.floor(Date.now() / 1000)) {
      const message = 'Enter a closing date and time in the future.';
      return { valid: false, message, fields: { expiresAt: message } };
    }
    return valid();
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'open-pool',
    recipient: '',
    amount: data.price.trim(),
    price: data.price.trim(),
    asset: data.asset.trim(),
    size: data.size.trim(),
    maxPerBuyer: data.maxPerBuyer.trim(),
    maxSoldPerPeriod: data.maxSoldPerPeriod.trim(),
    periodHours: data.periodHours.trim(),
    expiresAt: data.expiresAt.trim()
  }),
  deserialize: (action) => ({
    price: action.price || action.amount || '',
    asset: action.asset || '',
    size: String(action.size ?? ''),
    maxPerBuyer: String(action.maxPerBuyer ?? ''),
    maxSoldPerPeriod: String(action.maxSoldPerPeriod ?? ''),
    periodHours: String(action.periodHours ?? ''),
    expiresAt: action.expiresAt || ''
  }),
  buildCallVector: (data, context) => ({
    target: context.config.marketplaceContractId,
    function: 'open_pool',
    args: [
      decimalToStroops(data.price)?.toString() ?? '0',
      data.asset.trim(),
      String(parseExpiryToUnixSeconds(data.expiresAt) ?? 0),
      Number(data.size.trim()),
      Number(data.maxPerBuyer.trim()),
      Number(data.maxSoldPerPeriod.trim()),
      String(Number(data.periodHours.trim()) * 3600)
    ]
  })
};

function poolIdHandler(
  type: 'close-pool' | 'sweep-pool',
  label: string,
  description: string
): ActionHandler<PoolIdDraft> {
  return {
    type,
    label,
    description,
    group: 'Membership',
    FormComponent: PoolIdForm,
    getDefaultValues: () => ({ poolId: '' }),
    validate: (data) => {
      const result = wholeNumber(data.poolId, 'Pool');
      return result.valid ? result : { ...result, fields: { poolId: result.message ?? 'Enter the pool number.' } };
    },
    serialize: (data) => ({ id: crypto.randomUUID(), type, recipient: '', amount: '', poolId: data.poolId.trim() }),
    deserialize: (action) => ({ poolId: String(action.poolId ?? '') }),
    buildCallVector: (data, context) => ({
      target: context.config.marketplaceContractId,
      function: type === 'close-pool' ? 'close_pool' : 'sweep_pool',
      args: [Number(data.poolId.trim())]
    })
  };
}

export const closePoolHandler = poolIdHandler(
  'close-pool',
  'Close a pool',
  'Stop a pool’s sales now; its unminted tokens go back to the marketplace allowance'
);
export const sweepPoolHandler = poolIdHandler(
  'sweep-pool',
  'Sweep a closed pool',
  'Move a closed pool’s unsold tokens to the Treasury'
);
