import {
  type AdminAuthorityDraft,
  type AdminPaymentTokenDraft,
  AdminPaymentTokenForm,
  type AdminReservePriceDraft,
  AdminReservePriceForm,
  type AdminValueDraft,
  AdminValueForm,
  AuthorityProposalActionForm,
  type CancelPrimaryListingDraft,
  CancelPrimaryListingForm,
  type CreatePrimaryListingDraft,
  CreatePrimaryListingForm
} from '@/components/admin/admin-action-forms';
import { decimalToStroops, validateReservePrice } from '@/lib/auction-values';
import {
  validateAuctionTimeBuffer,
  validateProposalThreshold,
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

function authorityHandler(type: 'set-mint-authority', label: string): ActionHandler<AdminAuthorityDraft> {
  return {
    type,
    label,
    description: `${label} for an address`,
    group: 'Administration',
    FormComponent: AuthorityProposalActionForm,
    getDefaultValues: () => ({ authority: '', enabled: true }),
    validate: (data) => required(data.authority, 'authority', 'Authority address'),
    serialize: (data) => ({
      id: crypto.randomUUID(),
      type,
      recipient: data.authority.trim(),
      amount: '',
      authority: data.authority.trim(),
      enabled: data.enabled
    }),
    deserialize: (action) => ({
      authority: action.authority || action.recipient || '',
      enabled: action.enabled !== false
    }),
    buildCallVector: (data, context) => ({
      target: context.tokenContractId,
      function: 'set_mint_authority',
      args: [data.authority.trim(), data.enabled]
    })
  };
}

function settingHandler(
  type: 'set-voting-delay' | 'set-voting-period' | 'set-proposal-threshold' | 'set-quorum-bps',
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

export const setMintAuthorityHandler = authorityHandler('set-mint-authority', 'Set mint authority');
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
export const setAuctionDurationHandler = auctionDurationHandler(
  'set-auction-duration',
  'Auction duration',
  'set_duration',
  300
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

// Primary sales are lazy: after launch the Treasury is the marketplace admin, so creating and
// cancelling primary listings are governance proposal actions executed through treasury.execute.
export const createPrimaryListingHandler: ActionHandler<CreatePrimaryListingDraft> = {
  type: 'create-primary-listing',
  label: 'Create primary listing',
  description: 'Open a primary sale: the buyer receives a newly minted token',
  group: 'Administration',
  FormComponent: CreatePrimaryListingForm,
  getDefaultValues: () => ({ price: '', expiresAt: '' }),
  validate: (data) => {
    const priceError = validateReservePrice(data.price);
    if (priceError) return { valid: false, message: priceError, fields: { price: priceError } };
    const expiresAt = parseExpiryToUnixSeconds(data.expiresAt);
    if (expiresAt === null) {
      const message = 'Enter a valid expiry date and time.';
      return { valid: false, message, fields: { expiresAt: message } };
    }
    return valid();
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'create-primary-listing',
    recipient: '',
    amount: data.price.trim(),
    price: data.price.trim(),
    expiresAt: data.expiresAt.trim()
  }),
  deserialize: (action) => ({ price: action.price || action.amount || '', expiresAt: action.expiresAt || '' }),
  buildCallVector: (data, context) => ({
    target: context.config.marketplaceContractId,
    function: 'create_primary_listing',
    args: [decimalToStroops(data.price)?.toString() ?? '0', String(parseExpiryToUnixSeconds(data.expiresAt) ?? 0)]
  })
};

export const cancelPrimaryListingHandler: ActionHandler<CancelPrimaryListingDraft> = {
  type: 'cancel-primary-listing',
  label: 'Cancel primary listing',
  description: 'Cancel an open primary sale listing',
  group: 'Administration',
  FormComponent: CancelPrimaryListingForm,
  getDefaultValues: () => ({ listingId: '' }),
  validate: (data) => wholeNumber(data.listingId, 'Listing id'),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'cancel-primary-listing',
    recipient: '',
    amount: '',
    listingId: data.listingId.trim()
  }),
  deserialize: (action) => ({ listingId: action.listingId || '' }),
  buildCallVector: (data, context) => ({
    target: context.config.marketplaceContractId,
    function: 'cancel_primary',
    args: [data.listingId.trim()]
  })
};
