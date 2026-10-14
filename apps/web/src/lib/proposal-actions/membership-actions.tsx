'use client';

import { StrKey } from '@stellar/stellar-sdk';
import { useState } from 'react';
import { css } from 'styled-system/css';

import { Callout, Field, FieldHelperText, FieldLabel, Input, Select, Switch } from '@/components/ui';
import { useOptionalDaoContext } from '@/contexts/dao-context';
import { isValidStellarAddress } from '@/lib/validation';

import type { ActionFormProps, ActionHandler, ProposalActionType, ValidationResult } from './types';

/**
 * Membership actions (docs/designs/membership-models.md § 1, docs/designs/locked-tokens.md):
 * mint allowances for modules, the three membership switches, transfer agents, DAO recovery
 * transfers and DAO-approved transfers on a locked community. Each is one Token call the
 * Treasury makes when the proposal executes.
 */

const stack = css({ display: 'grid', gap: '3' });
const U32_MAX = 0xffffffff;
const fieldError = (result: ValidationResult | undefined, key: string) =>
  result && !result.valid ? result.fields?.[key] : undefined;

function invalid(field: string, message: string): ValidationResult {
  return { valid: false, message, fields: { [field]: message } };
}

function ErrorText({ result, field }: { result?: ValidationResult; field: string }) {
  const message = fieldError(result, field);
  return message ? <FieldHelperText tone="error">{message}</FieldHelperText> : null;
}

function tokenId(value: string): ValidationResult | null {
  return /^\d+$/.test(value.trim()) && Number(value.trim()) <= U32_MAX
    ? null
    : invalid('tokenId', 'Enter the token number.');
}

// --- Mint allowances ---------------------------------------------------------------------

export type MintAllowanceDraft = { module: string; amount: string; direction: 'increase' | 'decrease' };

function MintAllowanceForm({ value, onChange, disabled, validationErrors }: ActionFormProps<MintAllowanceDraft>) {
  // The community's own modules by name; anything else (custom code) by its contract.
  const config = useOptionalDaoContext()?.daoConfig;
  const known: Array<[string, string]> = [];
  if (config?.auctionContractId) known.push(['Auction', config.auctionContractId]);
  if (config?.marketplaceContractId) known.push(['Marketplace (quick-buy pools)', config.marketplaceContractId]);
  if (config?.claimsContractId) known.push(['Claims', config.claimsContractId]);
  const [other, setOther] = useState(() => Boolean(value.module) && !known.some(([, id]) => id === value.module));
  const typed = other || !known.length;
  return (
    <div className={stack}>
      <Field>
        <FieldLabel htmlFor={known.length ? 'allowance-module-pick' : 'allowance-module'}>Module</FieldLabel>
        {known.length ? (
          <Select
            id="allowance-module-pick"
            value={other ? 'other' : value.module}
            disabled={disabled}
            onChange={(event) => {
              const picked = event.target.value;
              setOther(picked === 'other');
              onChange({ ...value, module: picked === 'other' ? '' : picked });
            }}
          >
            <option value="">Choose a module</option>
            {known.map(([label, id]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value="other">Another module (enter its contract)</option>
          </Select>
        ) : null}
        {typed ? (
          <Input
            id="allowance-module"
            aria-label={known.length ? 'Module contract' : undefined}
            value={value.module}
            placeholder="Module contract (C…)"
            disabled={disabled}
            onChange={(event) => onChange({ ...value, module: event.target.value.trim() })}
          />
        ) : null}
        <ErrorText result={validationErrors} field="module" />
      </Field>
      <Field>
        <FieldLabel htmlFor="allowance-direction">Change</FieldLabel>
        <Select
          id="allowance-direction"
          value={value.direction}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, direction: event.target.value === 'decrease' ? 'decrease' : 'increase' })
          }
        >
          <option value="increase">Let it mint more tokens</option>
          <option value="decrease">Let it mint fewer tokens</option>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="allowance-amount">Tokens</FieldLabel>
        <Input
          id="allowance-amount"
          value={value.amount}
          inputMode="numeric"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, amount: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="amount" />
        <FieldHelperText>
          A module mints only up to its allowance. Pools and claim lists need one before they open.
        </FieldHelperText>
      </Field>
    </div>
  );
}

export const changeMintAllowanceHandler: ActionHandler<MintAllowanceDraft> = {
  type: 'change-mint-allowance',
  label: 'Change a mint allowance',
  description: 'Let a module (a pool, a claim list) mint more or fewer tokens',
  group: 'Membership',
  FormComponent: MintAllowanceForm,
  getDefaultValues: () => ({ module: '', amount: '', direction: 'increase' }),
  validate: (data) => {
    if (!StrKey.isValidContract(data.module.trim())) return invalid('module', 'Enter the module contract (C…).');
    if (!/^[1-9]\d*$/.test(data.amount.trim()) || Number(data.amount.trim()) > U32_MAX)
      return invalid('amount', 'Enter a whole number of tokens.');
    return { valid: true };
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'change-mint-allowance',
    recipient: data.module.trim(),
    amount: data.amount.trim(),
    module: data.module.trim(),
    direction: data.direction
  }),
  deserialize: (action) => ({
    module: action.module || action.recipient || '',
    amount: action.amount || '',
    direction: action.direction === 'decrease' ? 'decrease' : 'increase'
  }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: data.direction === 'decrease' ? 'decrease_mint_allowance' : 'increase_mint_allowance',
    args: [data.module.trim(), Number(data.amount.trim())]
  })
};

// --- Membership switches ---------------------------------------------------------------

export type SwitchDraft = { enabled: boolean };

type SwitchSpec = {
  type: Extract<ProposalActionType, 'set-transfers-locked' | 'set-members-only-delegation' | 'set-dao-recovery'>;
  label: string;
  description: string;
  fn: 'set_transfers_locked' | 'set_members_only_delegation' | 'set_dao_recovery';
  on: string;
  off: string;
  /** What turning it on takes from members, said before anyone votes for it. */
  warning: string;
};

function switchHandler(spec: SwitchSpec): ActionHandler<SwitchDraft> {
  function SwitchForm({ value, onChange, disabled }: ActionFormProps<SwitchDraft>) {
    return (
      <div className={stack}>
        <Switch
          label={spec.label}
          description={value.enabled ? spec.on : spec.off}
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
        {value.enabled ? <Callout variant="warning" title={spec.warning} /> : null}
      </div>
    );
  }
  return {
    type: spec.type,
    label: spec.label,
    description: spec.description,
    group: 'Membership',
    FormComponent: SwitchForm,
    getDefaultValues: () => ({ enabled: true }),
    validate: (data) =>
      typeof data.enabled === 'boolean' ? { valid: true } : { valid: false, message: 'Choose on or off.' },
    serialize: (data) => ({
      id: crypto.randomUUID(),
      type: spec.type,
      recipient: '',
      amount: '',
      enabled: data.enabled
    }),
    deserialize: (action) => ({ enabled: action.enabled === true }),
    buildCallVector: (data, context) => ({ target: context.tokenContractId, function: spec.fn, args: [data.enabled] })
  };
}

export const setTransfersLockedHandler = switchHandler({
  type: 'set-transfers-locked',
  label: 'Lock memberships',
  description: 'Choose whether members can sell or give their tokens to anyone',
  fn: 'set_transfers_locked',
  on: 'Tokens move only by sale from the tribe, by giving them back to the DAO, or by a DAO vote.',
  off: 'Members can transfer and sell their tokens freely.',
  warning:
    'Locking takes away every member’s way out by sale: after it, a member can only give their token back to the DAO or ask for a vote.'
});

export const setMembersOnlyDelegationHandler = switchHandler({
  type: 'set-members-only-delegation',
  label: 'Members-only delegation',
  description: 'Choose whether votes can be delegated to people outside the tribe',
  fn: 'set_members_only_delegation',
  on: 'Members can delegate their votes only to themselves or another member.',
  off: 'Members can delegate their votes to anyone.',
  warning: 'Existing delegations stay; new delegations to non-members are refused.'
});

export const setDaoRecoveryHandler = switchHandler({
  type: 'set-dao-recovery',
  label: 'DAO recovery',
  description: 'Choose whether a vote can move any member’s token',
  fn: 'set_dao_recovery',
  on: 'A proposal can move any membership to a new wallet, for example after a lost key.',
  off: 'Only a member can move their own token.',
  warning:
    'With recovery on, a majority vote can move any member’s token without their signature. Use it for lost keys and member agreements.'
});

// --- Transfer agents ---------------------------------------------------------------------

export type TransferAgentDraft = { module: string; enabled: boolean };

function TransferAgentForm({ value, onChange, disabled, validationErrors }: ActionFormProps<TransferAgentDraft>) {
  return (
    <div className={stack}>
      <Field>
        <FieldLabel htmlFor="agent-module">Module</FieldLabel>
        <Input
          id="agent-module"
          value={value.module}
          placeholder="Module contract (C…)"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, module: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="module" />
      </Field>
      <Switch
        label="Can move memberships"
        description={
          value.enabled
            ? 'The module can move a member’s token when the member signs, even while memberships are locked.'
            : 'The module can no longer move memberships.'
        }
        checked={value.enabled}
        disabled={disabled}
        onCheckedChange={(enabled) => onChange({ ...value, enabled })}
      />
    </div>
  );
}

export const setTransferAgentHandler: ActionHandler<TransferAgentDraft> = {
  type: 'set-transfer-agent',
  label: 'Change a transfer agent',
  description: 'Let a registered module move memberships with the member’s signature',
  group: 'Membership',
  FormComponent: TransferAgentForm,
  getDefaultValues: () => ({ module: '', enabled: true }),
  validate: (data) =>
    StrKey.isValidContract(data.module.trim())
      ? { valid: true }
      : invalid('module', 'Enter a registered module contract (C…).'),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'set-transfer-agent',
    recipient: data.module.trim(),
    amount: '',
    module: data.module.trim(),
    enabled: data.enabled
  }),
  deserialize: (action) => ({ module: action.module || action.recipient || '', enabled: action.enabled !== false }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'set_transfer_agent',
    args: [data.module.trim(), data.enabled]
  })
};

// --- DAO recovery transfer -------------------------------------------------------------

export type DaoTransferDraft = { tokenId: string; to: string };

function DaoTransferForm({ value, onChange, disabled, validationErrors }: ActionFormProps<DaoTransferDraft>) {
  return (
    <div className={stack}>
      <Field>
        <FieldLabel htmlFor="dao-transfer-token">Token</FieldLabel>
        <Input
          id="dao-transfer-token"
          value={value.tokenId}
          inputMode="numeric"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, tokenId: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="tokenId" />
      </Field>
      <Field>
        <FieldLabel htmlFor="dao-transfer-to">New holder</FieldLabel>
        <Input
          id="dao-transfer-to"
          value={value.to}
          placeholder="Wallet address (G…)"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, to: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="to" />
        <FieldHelperText>DAO recovery must be on, in this proposal or before it.</FieldHelperText>
      </Field>
      <Callout
        variant="warning"
        title="This moves a member’s token without their signature"
        description="The token and its votes go to the new holder when the proposal runs. Use it for a lost key or a recall members agreed to, and say which in the proposal."
      />
    </div>
  );
}

export const daoTransferHandler: ActionHandler<DaoTransferDraft> = {
  type: 'dao-transfer',
  label: 'Recover a membership',
  description: 'Move a member’s token to a new wallet by vote (DAO recovery)',
  group: 'Membership',
  FormComponent: DaoTransferForm,
  getDefaultValues: () => ({ tokenId: '', to: '' }),
  validate: (data) =>
    tokenId(data.tokenId) ??
    (isValidStellarAddress(data.to.trim()) ? { valid: true } : invalid('to', 'Enter the new holder’s address.')),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'dao-transfer',
    recipient: data.to.trim(),
    amount: '',
    tokenId: data.tokenId.trim(),
    to: data.to.trim()
  }),
  deserialize: (action) => ({ tokenId: String(action.tokenId ?? ''), to: action.to || action.recipient || '' }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'dao_transfer',
    args: [Number(data.tokenId.trim()), data.to.trim()]
  })
};

// --- DAO-approved transfer ---------------------------------------------------------------

export type ApprovedTransferDraft = { from: string; to: string; tokenId: string };

function ApprovedTransferForm({ value, onChange, disabled, validationErrors }: ActionFormProps<ApprovedTransferDraft>) {
  return (
    <div className={stack}>
      <Field>
        <FieldLabel htmlFor="approved-transfer-token">Token</FieldLabel>
        <Input
          id="approved-transfer-token"
          value={value.tokenId}
          inputMode="numeric"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, tokenId: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="tokenId" />
      </Field>
      <Field>
        <FieldLabel htmlFor="approved-transfer-from">Current holder</FieldLabel>
        <Input
          id="approved-transfer-from"
          value={value.from}
          placeholder="Wallet address (G…)"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, from: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="from" />
      </Field>
      <Field>
        <FieldLabel htmlFor="approved-transfer-to">New holder</FieldLabel>
        <Input
          id="approved-transfer-to"
          value={value.to}
          placeholder="Wallet address (G…)"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, to: event.target.value.trim() })}
        />
        <ErrorText result={validationErrors} field="to" />
        <FieldHelperText>
          The holder first approves the tribe for this token, from the token’s page (Approve the tribe). The transfer
          happens when the proposal runs, and fails if that approval has run out.
        </FieldHelperText>
      </Field>
    </div>
  );
}

export const approvedTransferHandler: ActionHandler<ApprovedTransferDraft> = {
  type: 'approved-transfer',
  label: 'Approve a membership transfer',
  description: 'Move a member’s token to someone new with their approval (locked memberships)',
  group: 'Membership',
  FormComponent: ApprovedTransferForm,
  getDefaultValues: () => ({ from: '', to: '', tokenId: '' }),
  validate: (data) =>
    tokenId(data.tokenId) ??
    (!isValidStellarAddress(data.from.trim())
      ? invalid('from', 'Enter the current holder’s address.')
      : !isValidStellarAddress(data.to.trim())
        ? invalid('to', 'Enter the new holder’s address.')
        : { valid: true }),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'approved-transfer',
    recipient: data.to.trim(),
    amount: '',
    tokenId: data.tokenId.trim(),
    from: data.from.trim(),
    to: data.to.trim()
  }),
  deserialize: (action) => ({
    tokenId: String(action.tokenId ?? ''),
    from: action.from || '',
    to: action.to || action.recipient || ''
  }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'transfer_from',
    args: [context.treasuryAddress, data.from.trim(), data.to.trim(), Number(data.tokenId.trim())]
  })
};

export const membershipHandlers: ActionHandler[] = [
  changeMintAllowanceHandler,
  setTransfersLockedHandler,
  setMembersOnlyDelegationHandler,
  setDaoRecoveryHandler,
  setTransferAgentHandler,
  daoTransferHandler,
  approvedTransferHandler
];
