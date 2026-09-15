// src/lib/proposal-actions/types.ts

import type { ComponentType } from 'react';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import type { AssetBalance } from '@/lib/treasury-queries';

/**
 * All supported proposal action types
 * Add new types here when adding new action handlers
 */
export type ProposalActionType = 'mint-governance-token' | 'batch-mint-governance-token' | 'transfer-sac-token';

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
  mintAuthorities?: Array<{ authority: string; enabled: boolean }>;
  mintAuthoritiesLoading?: boolean;
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
}

/**
 * Core action handler interface
 */
export interface ActionHandler<TData = any> {
  // Metadata
  type: ProposalActionType;
  label: string;
  description: string;
  order?: number; // Display order in dropdown (default: 0)
  group?: string; // Grouping (e.g., "Treasury", "Governance")

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

  // Optional metadata
  requiresMintAuthority?: boolean;
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
