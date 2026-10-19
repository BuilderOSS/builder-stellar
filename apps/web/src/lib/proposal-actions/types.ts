// src/lib/proposal-actions/types.ts

import type { ComponentType } from 'react';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import type { AssetBalance } from '@/lib/treasury-queries';

/**
 * All supported proposal action types
 * Add new types here when adding new action handlers
 */
export type ProposalActionType =
  | 'mint-governance-token'
  | 'batch-mint-governance-token'
  | 'transfer-sac-token'
  | 'change-mint-allowance'
  | 'set-transfers-locked'
  | 'set-members-only-delegation'
  | 'set-dao-recovery'
  | 'set-transfer-agent'
  | 'dao-transfer'
  | 'approved-transfer'
  | 'set-voting-delay'
  | 'set-voting-period'
  | 'set-queue-delay'
  | 'set-proposal-threshold'
  | 'set-quorum-bps'
  | 'pause-auction'
  | 'unpause-auction'
  | 'set-auction-duration'
  | 'set-auction-time-buffer'
  | 'set-auction-reserve-price'
  | 'set-auction-payment-token'
  | 'set-auction-min-bid-increment'
  | 'cancel-auction'
  | 'set-marketplace-payment-token'
  | 'set-marketplace-secondary-fee'
  | 'pause-marketplace'
  | 'unpause-marketplace'
  | 'open-pool'
  | 'close-pool'
  | 'sweep-pool'
  | 'add-artwork-properties'
  | 'set-artwork-renderer'
  | 'update-dao-profile'
  | 'upgrade-dao-module'
  | 'migrate-dao-module'
  | 'regenerate-token-traits'
  | 'treasury-authorize'
  | 'treasury-buy-listing'
  | 'open-claim-list'
  | 'set-token-metadata'
  | 'transfer-dao-token'
  | 'change-dao-slug'
  | 'create-module'
  | 'register-module'
  | 'unregister-module'
  | 'open-module';

/**
 * Queued action structure (persisted in store)
 */
export interface ProposalQueuedAction {
  id: string;
  type: ProposalActionType;
  recipient: string;
  amount: string;
  // Action-specific fields (discriminated union approach)
  assetCode?: string;
  assetContractId?: string;
  [key: string]: any; // Allow extension
}

/**
 * Validation result structure
 */
export type ValidationResult =
  | { valid: true }
  | {
      valid: false;
      message: string;
      fields?: Record<string, string>; // Field-specific errors
    };

/**
 * Precondition check result - determines if action can be executed at all
 */
export type PreconditionResult =
  | { canExecute: true }
  | {
      canExecute: false;
      reason: string; // User-facing message explaining why action cannot be executed
      loading?: boolean; // True if still checking preconditions
    };

/**
 * Context provided to all action handlers
 */
export interface FormContext {
  config: DaoNetworkConfig;
  session: {
    address: string | null;
    kit: any; // StellarWalletsKit instance
  };
  // Shared data
  balances?: AssetBalance[];
  balancesLoading?: boolean;
  balancesError?: string;
  /** True once the auction has taken a bid, which fixes its payment asset; undefined when unknown. */
  auctionPaymentTokenLocked?: boolean;
  // Allow custom extensions per action type
  [key: string]: any;
}

/**
 * Context for building call vectors
 */
export interface BuildContext {
  config: DaoNetworkConfig;
  governorContractId: string;
  tokenContractId: string;
  treasuryAddress: string;
}

/**
 * Result of building a call vector
 */
export interface CallVectorResult {
  target: string;
  function: string;
  args: any[]; // Encoded SC values
}

/**
 * Props for action-specific form components
 */
export interface ActionFormProps<TData> {
  value: TData;
  onChange: (value: TData) => void;
  disabled: boolean;
  validationErrors?: ValidationResult;
  network?: DaoNetworkConfig['name'];
}

/** The Manage sections (lib/manage-sections.ts), plus Treasury and Advanced: where a change lives. */
export const PROPOSAL_ACTION_GROUPS = [
  'Tribe',
  'Membership',
  'Rules',
  'Selling',
  'Treasury',
  'System',
  'Advanced'
] as const;
export type ProposalActionGroup = (typeof PROPOSAL_ACTION_GROUPS)[number];

/**
 * Core action handler interface
 */
export interface ActionHandler<TData = any> {
  // Metadata
  type: ProposalActionType;
  label: string;
  description: string;
  order?: number; // Display order in dropdown (default: 0)
  group?: ProposalActionGroup;

  // Form component
  FormComponent: ComponentType<ActionFormProps<TData>>;

  // Data lifecycle
  getDefaultValues: () => TData;
  validate: (data: TData, context: FormContext) => ValidationResult;
  serialize: (data: TData, context: FormContext) => ProposalQueuedAction;
  deserialize: (action: ProposalQueuedAction) => TData;

  // Call building
  buildCallVector: (data: TData, context: BuildContext) => CallVectorResult;

  // Precondition check - determines if action can be executed at all (independent of form data)
  checkPreconditions?: (context: FormContext) => PreconditionResult;

  /** False for actions the picker does not offer (prepared elsewhere, or failing as things stand). Default true. */
  pickable?: boolean;

  // Optional metadata
}

/**
 * Editing state
 */
export type EditingState = {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  index?: number; // Index in queue when editing
  draftData: any; // Current form data
};
