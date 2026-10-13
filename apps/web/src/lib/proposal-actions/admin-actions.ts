import { StrKey } from '@stellar/stellar-sdk';

import {
  type AdminPaymentTokenDraft,
  AdminPaymentTokenForm,
  type AdminReservePriceDraft,
  AdminReservePriceForm,
  type AdminValueDraft,
  AdminValueForm,
  type OpenPoolDraft,
  OpenPoolForm,
  type PoolIdDraft,
  PoolIdForm
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
import { getStellarAddressError, isValidStellarAddress } from '@/lib/validation';

import type { ActionHandler, ValidationResult } from './types';

type EmptyDraft = Record<string, never>;

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
  label: string,
  functionName: string,
  limitCheck: (value: number | bigint) => string | null
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description: `Update ${label.toLowerCase()}`,
    group: 'Administration',
    FormComponent: AdminValueForm,
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => {
      const whole = wholeNumber(data.value, label);
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
  label: string,
  functionName: 'set_duration' | 'set_time_buffer',
  minimum: number,
  limitCheck?: (seconds: number) => string | null
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description: `Update ${label.toLowerCase()}`,
    group: 'Administration',
    FormComponent: AdminValueForm,
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => {
      const parsed = Number(data.value.trim());
      if (!/^\d+$/.test(data.value.trim()) || !Number.isSafeInteger(parsed)) {
        return {
          valid: false,
          message: `${label} must be a whole number.`,
          fields: { value: `${label} must be a whole number.` }
        };
      }
      if (parsed < minimum) {
        return {
          valid: false,
          message: `${label} must be at least ${minimum} seconds.`,
          fields: { value: `${label} must be at least ${minimum} seconds.` }
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

export const setVotingDelayHandler = settingHandler('set-voting-delay', 'Voting delay', 'set_voting_delay', (value) =>
  validateVotingDelay(Number(value))
);
export const setVotingPeriodHandler = settingHandler(
  'set-voting-period',
  'Voting period',
  'set_voting_period',
  (value) => validateVotingPeriod(Number(value))
);
export const setProposalThresholdHandler = settingHandler(
  'set-proposal-threshold',
  'Proposal threshold',
  'set_proposal_threshold',
  (value) => validateProposalThreshold(value)
);
export const setQuorumBpsHandler = settingHandler('set-quorum-bps', 'Quorum', 'set_quorum_bps', (value) =>
  validateQuorumBps(Number(value))
);
export const setQueueDelayHandler = settingHandler('set-queue-delay', 'Queue delay', 'set_queue_delay', (value) =>
  validateQueueDelay(Number(value))
);
export const setAuctionDurationHandler = auctionDurationHandler(
  'set-auction-duration',
  'Auction duration',
  'set_duration',
  300,
  (seconds) => (seconds > 2_592_000 ? 'Auction duration cannot exceed 30 days.' : null)
);
export const setAuctionTimeBufferHandler = auctionDurationHandler(
  'set-auction-time-buffer',
  'Auction time buffer',
  'set_time_buffer',
  1,
  validateAuctionTimeBuffer
);

function emptyAuctionHandler(type: 'pause-auction' | 'unpause-auction', label: string): ActionHandler<EmptyDraft> {
  return {
    type,
    label,
    description: label,
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

export const pauseAuctionHandler = emptyAuctionHandler('pause-auction', 'Pause auction');
// Label is generic since unpause can mean either "launch" (first time) or "resume" (after pause)
// Admin page determines context-aware label based on auction status
export const unpauseAuctionHandler = emptyAuctionHandler('unpause-auction', 'Resume or launch auction');

export const setAuctionReservePriceHandler: ActionHandler<AdminReservePriceDraft> = {
  type: 'set-auction-reserve-price',
  label: 'Set auction reserve price',
  description: 'Update the reserve price while the auction is paused',
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
  label: 'Set auction payment token',
  description: 'Update the payment token while the auction is paused',
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
  label: 'Set marketplace payment asset',
  description: 'Update the marketplace payment asset; existing listings keep their snapshotted asset',
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
  label: string,
  minimum: number,
  maximum: number
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description: `Update ${label.toLowerCase()}`,
    group: 'Administration',
    FormComponent: AdminValueForm,
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => {
      const parsed = Number(data.value.trim());
      return /^\d+$/.test(data.value.trim()) && Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? valid()
        : {
            valid: false,
            message: `${label} must be a whole number between ${minimum} and ${maximum}.`,
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

export const setMarketplaceSecondaryFeeHandler = boundedModuleValueHandler(
  'set-marketplace-secondary-fee',
  'Marketplace secondary fee (bps)',
  0,
  MAX_MARKETPLACE_FEE_BPS
);
export const setAuctionMinBidIncrementHandler = boundedModuleValueHandler(
  'set-auction-min-bid-increment',
  'Auction minimum bid increment (%)',
  1,
  100
);

function emptyModuleHandler(
  type: 'pause-marketplace' | 'unpause-marketplace' | 'cancel-auction',
  label: string
): ActionHandler<EmptyDraft> {
  return {
    type,
    label,
    description: label,
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

export const pauseMarketplaceHandler = emptyModuleHandler('pause-marketplace', 'Pause marketplace');
export const unpauseMarketplaceHandler = emptyModuleHandler('unpause-marketplace', 'Resume marketplace');
export const cancelAuctionHandler = emptyModuleHandler('cancel-auction', 'Cancel paused auction');

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
  validate: (data) => {
    const priceError = validateReservePrice(data.price);
    if (priceError) return { valid: false, message: priceError, fields: { price: priceError } };
    if (!StrKey.isValidContract(data.asset.trim())) {
      const message = 'Choose the asset buyers pay in.';
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
