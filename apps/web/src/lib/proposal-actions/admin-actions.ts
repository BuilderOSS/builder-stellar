import {
  type AdminAuthorityDraft,
  type AdminPaymentTokenDraft,
  AdminPaymentTokenForm,
  type AdminReservePriceDraft,
  AdminReservePriceForm,
  type AdminValueDraft,
  AdminValueForm,
  AuthorityProposalActionForm
} from '@/components/admin/admin-action-forms';

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

function decimalPrice(value: string): ValidationResult {
  if (!/^\d+(?:\.\d{1,7})?$/.test(value.trim())) {
    return {
      valid: false,
      message: 'Reserve price must be a number with up to 7 decimal places.',
      fields: { reservePrice: 'Enter a valid reserve price.' }
    };
  }
  const stroops = decimalToStroops(value);
  return stroops >= 1000n
    ? valid()
    : {
        valid: false,
        message: 'Reserve price is too low.',
        fields: { reservePrice: 'Minimum reserve price is 0.0001.' }
      };
}

function decimalToStroops(value: string): bigint {
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0') || '0');
}

function authorityHandler(
  type: 'set-mint-authority' | 'set-governor-authority',
  label: string
): ActionHandler<AdminAuthorityDraft> {
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
      target: type === 'set-mint-authority' ? context.tokenContractId : context.governorContractId,
      function: type === 'set-mint-authority' ? 'set_mint_authority' : 'set_governor_authority',
      args: [data.authority.trim(), data.enabled]
    })
  };
}

function settingHandler(
  type: 'set-voting-delay' | 'set-voting-period' | 'set-proposal-threshold' | 'set-quorum-bps',
  label: string,
  functionName: string
): ActionHandler<AdminValueDraft> {
  return {
    type,
    label,
    description: `Update ${label.toLowerCase()}`,
    group: 'Administration',
    FormComponent: AdminValueForm,
    getDefaultValues: () => ({ value: '' }),
    validate: (data) => wholeNumber(data.value, label),
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
      args: [context.treasuryAddress, type === 'set-proposal-threshold' ? data.value.trim() : Number(data.value.trim())]
    })
  };
}

export const setMintAuthorityHandler = authorityHandler('set-mint-authority', 'Set mint authority');
export const setGovernorAuthorityHandler = authorityHandler('set-governor-authority', 'Set governor authority');
export const setVotingDelayHandler = settingHandler('set-voting-delay', 'Voting delay', 'set_voting_delay');
export const setVotingPeriodHandler = settingHandler('set-voting-period', 'Voting period', 'set_voting_period');
export const setProposalThresholdHandler = settingHandler(
  'set-proposal-threshold',
  'Proposal threshold',
  'set_proposal_threshold'
);
export const setQuorumBpsHandler = settingHandler('set-quorum-bps', 'Quorum', 'set_quorum_bps');

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
export const unpauseAuctionHandler = emptyAuctionHandler('unpause-auction', 'Resume auction');

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
    args: [decimalToStroops(data.reservePrice).toString()]
  })
};

export const setAuctionPaymentTokenHandler: ActionHandler<AdminPaymentTokenDraft> = {
  type: 'set-auction-payment-token',
  label: 'Set auction payment token',
  description: 'Update the payment token while the auction is paused',
  group: 'Administration',
  FormComponent: AdminPaymentTokenForm,
  getDefaultValues: () => ({ paymentToken: '' }),
  validate: (data) => required(data.paymentToken, 'paymentToken', 'Payment token contract address'),
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
