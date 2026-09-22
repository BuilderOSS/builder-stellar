// src/lib/proposal-actions/actions/mint-governance-token/component.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { FieldHelperText, FieldLabel, Input } from '@/components/ui';

import type { ActionFormProps } from '../../types';
import type { MintGovernanceTokenData } from './types';

export function MintGovernanceTokenForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<MintGovernanceTokenData>) {
  return (
    <Stack gap="3">
      <Stack gap="2">
        <FieldLabel htmlFor="recipient">Recipient</FieldLabel>
        <Input
          id="recipient"
          value={value.recipient}
          onChange={(e) => onChange({ ...value, recipient: e.target.value })}
          placeholder="Recipient address (G... or C...)"
          disabled={disabled}
          aria-invalid={!!(validationErrors && !validationErrors.valid && validationErrors.fields?.recipient)}
          aria-describedby={
            validationErrors && !validationErrors.valid && validationErrors.fields?.recipient
              ? 'recipient-error'
              : undefined
          }
        />
        {validationErrors && !validationErrors.valid && validationErrors.fields?.recipient ? (
          <FieldHelperText id="recipient-error" style={{ color: '#f87171' }}>
            {validationErrors.fields.recipient}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Enter a valid Stellar address</FieldHelperText>
        )}
      </Stack>

      <Stack gap="2">
        <FieldLabel htmlFor="amount">Amount</FieldLabel>
        <Input
          id="amount"
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder="1"
          disabled
          aria-invalid={!!(validationErrors && !validationErrors.valid && validationErrors.fields?.amount)}
          aria-describedby={
            validationErrors && !validationErrors.valid && validationErrors.fields?.amount
              ? 'amount-error'
              : 'amount-helper'
          }
        />
        {validationErrors && !validationErrors.valid && validationErrors.fields?.amount ? (
          <FieldHelperText id="amount-error" style={{ color: '#f87171' }}>
            {validationErrors.fields.amount}
          </FieldHelperText>
        ) : (
          <FieldHelperText id="amount-helper">
            Single mint action always mints 1 token (use batch mint for multiple)
          </FieldHelperText>
        )}
      </Stack>
    </Stack>
  );
}
