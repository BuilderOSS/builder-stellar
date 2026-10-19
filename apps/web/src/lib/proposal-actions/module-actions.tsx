'use client';

import { StrKey } from '@stellar/stellar-sdk';

import { CodeBlock, Text } from '@/components/ui';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { isModuleKind, MODULE_COPY, type ModuleKind, specArg, validateModuleConfig } from '@/lib/modules/kinds';

import type { ActionFormProps, ActionHandler, ValidationResult } from './types';

/**
 * Module actions (docs/designs/module-attach-ui.md): the calls a proposal makes to add a module the
 * Manager deploys, register it with the Token, open it, or remove it. They are built as a batch from
 * Manage → Membership, never typed by hand, so each form here only shows what the proposal will do.
 */

const invalid = (message: string): ValidationResult => ({ valid: false, message });
const valid = (): ValidationResult => ({ valid: true });

function Summary({ lines }: { lines: string[] }) {
  return (
    <>
      <Text>Added from Manage → Membership, with the steps it needs. This shows what the proposal will do.</Text>
      <CodeBlock>{lines.join('\n')}</CodeBlock>
    </>
  );
}

/** Whether this tribe already has a module of the kind (the Token holds one per built-in kind). */
function existing(config: Record<string, unknown>, kind: ModuleKind) {
  const key =
    kind === 'auction' ? 'auctionContractId' : kind === 'marketplace' ? 'marketplaceContractId' : 'claimsContractId';
  return Boolean(config[key]);
}

// --- Create ------------------------------------------------------------------------------

export type CreateModuleDraft = {
  kind: ModuleKind;
  /** How many modules of this kind the Manager has deployed so far: the number this one is deployed as. */
  moduleNumber: string;
  /** Where the Manager says it will deploy (`predict_module_address`). */
  address: string;
  paymentAsset: string;
  reservePrice: string;
  duration: string;
  timeBuffer: string;
  feeBps: string;
};

function createConfig(data: CreateModuleDraft) {
  if (data.kind === 'auction')
    return {
      paymentAsset: data.paymentAsset,
      reservePrice: data.reservePrice,
      duration: data.duration,
      timeBuffer: data.timeBuffer
    };
  if (data.kind === 'marketplace') return { paymentAsset: data.paymentAsset, feeBps: data.feeBps };
  return { paymentAsset: data.paymentAsset };
}

export const createModuleHandler: ActionHandler<CreateModuleDraft> = {
  type: 'create-module',
  label: 'Add a module',
  description: 'Deploy an auction, market or claims module for this tribe',
  group: 'Rules',
  FormComponent: ({ value }: ActionFormProps<CreateModuleDraft>) => (
    <Summary
      lines={[
        value.kind ? `Deploy ${MODULE_COPY[value.kind].noun} as module number ${value.moduleNumber}` : 'Nothing chosen',
        value.address ? `It will live at ${value.address}` : ''
      ].filter(Boolean)}
    />
  ),
  getDefaultValues: () => ({
    kind: 'marketplace',
    moduleNumber: '',
    address: '',
    paymentAsset: '',
    reservePrice: '',
    duration: '',
    timeBuffer: '',
    feeBps: ''
  }),
  validate: (data, context) => {
    if (!isModuleKind(data.kind)) return invalid('Choose a module.');
    if (!/^\d{1,9}$/.test(data.moduleNumber)) return invalid('The module number is missing. Add it again from Manage.');
    if (!StrKey.isValidContract(data.address))
      return invalid('The module’s address is missing. Add it again from Manage.');
    const config = createConfig(data);
    const problem = validateModuleConfig(data.kind, config as never);
    if (problem) return invalid(problem);
    if (existing(context.config as unknown as Record<string, unknown>, data.kind))
      return invalid(`This tribe already has ${MODULE_COPY[data.kind].noun}. Remove it first to replace it.`);
    return valid();
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'create-module',
    recipient: data.address,
    amount: '',
    kind: data.kind,
    moduleNumber: data.moduleNumber,
    address: data.address,
    paymentAsset: data.paymentAsset,
    reservePrice: data.reservePrice,
    duration: data.duration,
    timeBuffer: data.timeBuffer,
    feeBps: data.feeBps
  }),
  deserialize: (action) => ({
    kind: isModuleKind(action.kind) ? action.kind : 'marketplace',
    moduleNumber: String(action.moduleNumber ?? ''),
    address: String(action.address ?? action.recipient ?? ''),
    paymentAsset: String(action.paymentAsset ?? ''),
    reservePrice: String(action.reservePrice ?? ''),
    duration: String(action.duration ?? ''),
    timeBuffer: String(action.timeBuffer ?? ''),
    feeBps: String(action.feeBps ?? '')
  }),
  buildCallVector: (data, context) => ({
    target: getDeploymentConfig().managerAddress,
    function: 'create_module',
    args: [context.tokenContractId, specArg(data.kind, createConfig(data) as never), Number(data.moduleNumber)]
  }),
  checkPreconditions: (context) =>
    context.config.treasuryContractId && context.config.adminAddress === context.config.treasuryContractId
      ? { canExecute: true }
      : { canExecute: false, reason: 'Adding a module by proposal works once the tribe has launched.' }
};

// --- Register ----------------------------------------------------------------------------

export type RegisterModuleDraft = { kind: ModuleKind; address: string; nonVoting: boolean };

export const registerModuleHandler: ActionHandler<RegisterModuleDraft> = {
  type: 'register-module',
  label: 'Register a module',
  description: 'Make a deployed module part of the tribe',
  group: 'Rules',
  FormComponent: ({ value }: ActionFormProps<RegisterModuleDraft>) => (
    <Summary
      lines={[
        value.kind ? `Register ${MODULE_COPY[value.kind].noun} (${value.address})` : 'Nothing chosen',
        value.nonVoting ? 'It holds memberships without votes.' : 'It keeps no votes to count.'
      ]}
    />
  ),
  getDefaultValues: () => ({ kind: 'marketplace', address: '', nonVoting: true }),
  validate: (data) => {
    if (!isModuleKind(data.kind)) return invalid('Choose a module.');
    if (!StrKey.isValidContract(data.address)) return invalid('Enter the module contract (C…).');
    return typeof data.nonVoting === 'boolean' ? valid() : invalid('Say whether it holds memberships without votes.');
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'register-module',
    recipient: data.address,
    amount: '',
    kind: data.kind,
    address: data.address,
    nonVoting: data.nonVoting
  }),
  deserialize: (action) => ({
    kind: isModuleKind(action.kind) ? action.kind : 'marketplace',
    address: String(action.address ?? action.recipient ?? ''),
    nonVoting: action.nonVoting !== false
  }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'register_module',
    args: [data.kind, data.address, data.nonVoting]
  })
};

// --- Unregister --------------------------------------------------------------------------

export type UnregisterModuleDraft = { kind: ModuleKind; address: string };

export const unregisterModuleHandler: ActionHandler<UnregisterModuleDraft> = {
  type: 'unregister-module',
  label: 'Remove a module',
  description: 'Take a module out of the tribe. Its mint allowance goes with it.',
  group: 'Rules',
  FormComponent: ({ value }: ActionFormProps<UnregisterModuleDraft>) => (
    <Summary
      lines={[
        value.kind ? `Remove ${MODULE_COPY[value.kind].noun} (${value.address})` : 'Nothing chosen',
        'Its mint allowance is cleared with it.'
      ]}
    />
  ),
  getDefaultValues: () => ({ kind: 'marketplace', address: '' }),
  validate: (data) => {
    if (!isModuleKind(data.kind)) return invalid('Choose a module.');
    return StrKey.isValidContract(data.address) ? valid() : invalid('Enter the module contract (C…).');
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'unregister-module',
    recipient: data.address,
    amount: '',
    kind: data.kind,
    address: data.address
  }),
  deserialize: (action) => ({
    kind: isModuleKind(action.kind) ? action.kind : 'marketplace',
    address: String(action.address ?? action.recipient ?? '')
  }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'unregister_module',
    args: [data.address]
  }),
  checkPreconditions: (context) =>
    context.config.treasuryContractId && context.config.adminAddress === context.config.treasuryContractId
      ? { canExecute: true }
      : { canExecute: false, reason: 'Only a vote can remove a module, so this works once the tribe has launched.' }
};

// --- Open --------------------------------------------------------------------------------

export type OpenModuleDraft = { kind: Extract<ModuleKind, 'auction' | 'marketplace'>; address: string };

/**
 * Opens a module named by its address. The existing resume and reopen actions read the module from
 * the tribe's indexed settings, which has nothing for a module this same proposal is still adding.
 */
export const openModuleHandler: ActionHandler<OpenModuleDraft> = {
  type: 'open-module',
  label: 'Open a module',
  description: 'Start the first auction, or let sales in the market begin',
  group: 'Rules',
  FormComponent: ({ value }: ActionFormProps<OpenModuleDraft>) => (
    <Summary
      lines={[
        value.kind === 'auction' ? 'Start the first auction' : 'Open the market',
        value.address ? `Module ${value.address}` : ''
      ].filter(Boolean)}
    />
  ),
  getDefaultValues: () => ({ kind: 'marketplace', address: '' }),
  validate: (data) => {
    if (data.kind !== 'auction' && data.kind !== 'marketplace') return invalid('Only an auction or a market opens.');
    return StrKey.isValidContract(data.address) ? valid() : invalid('Enter the module contract (C…).');
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'open-module',
    recipient: data.address,
    amount: '',
    kind: data.kind,
    address: data.address
  }),
  deserialize: (action) => ({
    kind: action.kind === 'auction' ? 'auction' : 'marketplace',
    address: String(action.address ?? action.recipient ?? '')
  }),
  buildCallVector: (data, context) => ({
    target: data.address,
    function: 'unpause',
    args: data.kind === 'auction' ? [context.treasuryAddress] : []
  })
};

export const moduleHandlers: ActionHandler[] = [
  createModuleHandler,
  registerModuleHandler,
  unregisterModuleHandler,
  openModuleHandler
] as ActionHandler[];
