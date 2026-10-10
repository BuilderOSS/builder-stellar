'use client';

import { css } from 'styled-system/css';

import { Field, FieldHelperText, FieldLabel, Input } from '@/components/ui';
import {
  isValidStellarAddress,
  isValidTokenSymbol,
  MAX_TOKEN_NAME_BYTES,
  MAX_TOKEN_SYMBOL_LENGTH,
  MAX_TOKEN_URI_BYTES,
  utf8Length
} from '@/lib/validation';

import type { ActionFormProps, ActionHandler, ValidationResult } from './types';

const stack = css({ display: 'grid', gap: '3' });
const fieldError = (result: ValidationResult | undefined, key: string) =>
  result && !result.valid ? result.fields?.[key] : undefined;

export type TokenMetadataDraft = { name: string; symbol: string; uri: string };

function validateTokenMetadata(data: TokenMetadataDraft): ValidationResult {
  const fields: Record<string, string> = {};
  const name = data.name.trim();
  if (name.length < 2) fields.name = 'Use at least 2 characters';
  else if (utf8Length(name) > MAX_TOKEN_NAME_BYTES) fields.name = `Use at most ${MAX_TOKEN_NAME_BYTES} characters`;
  if (!isValidTokenSymbol(data.symbol.trim()))
    fields.symbol = `Use capital letters or numbers, up to ${MAX_TOKEN_SYMBOL_LENGTH} characters`;
  const uri = data.uri.trim();
  if (!/^https?:\/\//i.test(uri) && !/^ipfs:\/\//i.test(uri)) fields.uri = 'Enter an http(s) or ipfs:// URL';
  else if (utf8Length(uri) > MAX_TOKEN_URI_BYTES) fields.uri = `Use at most ${MAX_TOKEN_URI_BYTES} bytes`;
  const first = Object.values(fields)[0];
  return first ? { valid: false, message: first, fields } : { valid: true };
}

function TokenMetadataForm({ value, onChange, disabled, validationErrors }: ActionFormProps<TokenMetadataDraft>) {
  return (
    <div className={stack}>
      <Field>
        <FieldLabel htmlFor="token-metadata-name">Name</FieldLabel>
        <Input
          id="token-metadata-name"
          value={value.name}
          maxLength={MAX_TOKEN_NAME_BYTES}
          disabled={disabled}
          aria-invalid={Boolean(fieldError(validationErrors, 'name')) || undefined}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
        {fieldError(validationErrors, 'name') ? (
          <FieldHelperText tone="error">{fieldError(validationErrors, 'name')}</FieldHelperText>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="token-metadata-symbol">Symbol</FieldLabel>
        <Input
          id="token-metadata-symbol"
          value={value.symbol}
          maxLength={MAX_TOKEN_SYMBOL_LENGTH}
          disabled={disabled}
          aria-invalid={Boolean(fieldError(validationErrors, 'symbol')) || undefined}
          onChange={(event) => onChange({ ...value, symbol: event.target.value.toUpperCase() })}
        />
        {fieldError(validationErrors, 'symbol') ? (
          <FieldHelperText tone="error">{fieldError(validationErrors, 'symbol')}</FieldHelperText>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="token-metadata-uri">Token metadata URL</FieldLabel>
        <Input
          id="token-metadata-uri"
          type="url"
          value={value.uri}
          disabled={disabled}
          aria-invalid={Boolean(fieldError(validationErrors, 'uri')) || undefined}
          onChange={(event) => onChange({ ...value, uri: event.target.value })}
        />
        <FieldHelperText>Usually unchanged. Token pages are built from this address.</FieldHelperText>
      </Field>
    </div>
  );
}

/** Rename the community's token (name and symbol), via token.set_metadata. Token 0.2.0+ reports it. */
export const setTokenMetadataHandler: ActionHandler<TokenMetadataDraft> = {
  type: 'set-token-metadata',
  label: 'Rename the community',
  description: 'Change the token name and symbol members see everywhere',
  group: 'Administration',
  FormComponent: TokenMetadataForm,
  getDefaultValues: () => ({ name: '', symbol: '', uri: '' }),
  validate: (data) => validateTokenMetadata(data),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'set-token-metadata',
    recipient: '',
    amount: '',
    name: data.name.trim(),
    symbol: data.symbol.trim(),
    uri: data.uri.trim()
  }),
  deserialize: (action) => ({ name: action.name ?? '', symbol: action.symbol ?? '', uri: action.uri ?? '' }),
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'set_metadata',
    args: [data.uri.trim(), data.name.trim(), data.symbol.trim()]
  })
};

export type DaoTokenTransferDraft = { tokenId: string; recipient: string };

function validateDaoTokenTransfer(data: DaoTokenTransferDraft): ValidationResult {
  const fields: Record<string, string> = {};
  if (!/^\d+$/.test(data.tokenId.trim())) fields.tokenId = 'Enter a token number';
  if (!isValidStellarAddress(data.recipient.trim())) fields.recipient = 'Enter a Stellar address';
  const first = Object.values(fields)[0];
  return first ? { valid: false, message: first, fields } : { valid: true };
}

function DaoTokenTransferForm({ value, onChange, disabled, validationErrors }: ActionFormProps<DaoTokenTransferDraft>) {
  return (
    <div className={stack}>
      <Field>
        <FieldLabel htmlFor="dao-token-id">Token number</FieldLabel>
        <Input
          id="dao-token-id"
          inputMode="numeric"
          value={value.tokenId}
          disabled={disabled}
          aria-invalid={Boolean(fieldError(validationErrors, 'tokenId')) || undefined}
          onChange={(event) => onChange({ ...value, tokenId: event.target.value })}
        />
        {fieldError(validationErrors, 'tokenId') ? (
          <FieldHelperText tone="error">{fieldError(validationErrors, 'tokenId')}</FieldHelperText>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="dao-token-recipient">Give it to</FieldLabel>
        <Input
          id="dao-token-recipient"
          value={value.recipient}
          spellCheck={false}
          disabled={disabled}
          aria-invalid={Boolean(fieldError(validationErrors, 'recipient')) || undefined}
          onChange={(event) => onChange({ ...value, recipient: event.target.value.trim() })}
        />
        {fieldError(validationErrors, 'recipient') ? (
          <FieldHelperText tone="error">{fieldError(validationErrors, 'recipient')}</FieldHelperText>
        ) : null}
      </Field>
    </div>
  );
}

/** Move a membership token the treasury holds (e.g. from a cancelled auction) to someone. */
export const transferDaoTokenHandler: ActionHandler<DaoTokenTransferDraft> = {
  type: 'transfer-dao-token',
  label: 'Give a treasury token',
  description: 'Send a membership token the treasury holds to someone',
  group: 'Treasury',
  FormComponent: DaoTokenTransferForm,
  getDefaultValues: () => ({ tokenId: '', recipient: '' }),
  validate: (data) => validateDaoTokenTransfer(data),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'transfer-dao-token',
    recipient: data.recipient.trim(),
    amount: '',
    tokenId: data.tokenId.trim()
  }),
  deserialize: (action) => ({ tokenId: String(action.tokenId ?? ''), recipient: action.recipient ?? '' }),
  // The Treasury executes the call, so `from` is the Treasury and its own auth covers it.
  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'transfer',
    args: [context.treasuryAddress, data.recipient.trim(), Number(data.tokenId.trim())]
  })
};
