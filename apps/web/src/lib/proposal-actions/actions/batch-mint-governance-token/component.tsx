// src/lib/proposal-actions/actions/batch-mint-governance-token/component.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { AdminDraftActionPreview } from '@/components/admin/admin-draft-action-preview';
import { FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { MAX_BATCH_MINT } from '@/lib/batch-mint-budget';

import type { ActionFormProps, ProposalQueuedAction } from '../../types';
import type { BatchMintGovernanceTokenData } from './types';

export function BatchMintGovernanceTokenForm({
  value,
  onChange,
  disabled,
  validationErrors,
  draftPreview
}: ActionFormProps<BatchMintGovernanceTokenData> & { draftPreview?: ProposalQueuedAction }) {
  return (
    <Stack gap="3">
      {draftPreview && <AdminDraftActionPreview action={draftPreview} compact />}
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
          type="number"
          min="1"
          max={MAX_BATCH_MINT}
          step="1"
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder={`Number of tokens (1-${MAX_BATCH_MINT})`}
          disabled={disabled}
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
            Batch mint allows 1-{MAX_BATCH_MINT} tokens in a single action (the per-transaction event budget)
          </FieldHelperText>
        )}
      </Stack>
    </Stack>
  );
}
