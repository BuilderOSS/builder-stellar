// src/lib/proposal-actions/actions/transfer-sac-token/component.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Button, FieldHelperText, FieldLabel, Input, Select } from '@/components/ui';

import { useActionFormContext } from '../../context';
import type { ActionFormProps } from '../../types';
import type { TransferSacTokenData } from './types';

export function TransferSacTokenForm({
  value,
  onChange,
  disabled,
  validationErrors
}: ActionFormProps<TransferSacTokenData>) {
  const context = useActionFormContext();
  const { balances, balancesLoading } = context;

  const selectedBalance = balances?.find((b) => b.assetCode === value.assetCode);

  const balanceDisplay =
    value.assetCode && balances
      ? selectedBalance
        ? `${parseFloat(selectedBalance.balance).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 7
          })} ${value.assetCode}`
        : `0 ${value.assetCode}`
      : null;

  const handleMaxClick = () => {
    if (selectedBalance) {
      onChange({ ...value, amount: selectedBalance.balance });
    }
  };

  return (
    <Stack gap="3">
      <Stack gap="2">
        <FieldLabel htmlFor="asset-code">Asset</FieldLabel>
        <Select
          id="asset-code"
          value={value.assetCode}
          onChange={(e) => onChange({ ...value, assetCode: e.target.value })}
          disabled={disabled}
          aria-invalid={!!(validationErrors && !validationErrors.valid && validationErrors.fields?.assetCode)}
          aria-describedby={
            validationErrors && !validationErrors.valid && validationErrors.fields?.assetCode
              ? 'asset-code-error'
              : undefined
          }
        >
          <option value="">Select asset...</option>
          <option value="XLM">XLM (Native)</option>
          <option value="USDC">USDC</option>
          <option value="EURC">EURC</option>
        </Select>
        {validationErrors && !validationErrors.valid && validationErrors.fields?.assetCode ? (
          <FieldHelperText id="asset-code-error" style={{ color: '#f87171' }}>
            {validationErrors.fields.assetCode}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Choose which SAC token to transfer</FieldHelperText>
        )}
        {balanceDisplay && (
          <FieldHelperText>
            <strong>Treasury balance:</strong> {balancesLoading ? 'Loading...' : balanceDisplay}
          </FieldHelperText>
        )}
      </Stack>

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
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <Input
              id="amount"
              type="number"
              step="0.0000001"
              min="0"
              value={value.amount}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              placeholder="Amount to transfer"
              disabled={disabled}
              aria-invalid={!!(validationErrors && !validationErrors.valid && validationErrors.fields?.amount)}
              aria-describedby={
                validationErrors && !validationErrors.valid && validationErrors.fields?.amount
                  ? 'amount-error'
                  : 'amount-helper'
              }
            />
          </div>
          {value.assetCode && selectedBalance && (
            <Button
              type="button"
              variant="outline"
              onClick={handleMaxClick}
              disabled={disabled || balancesLoading}
              style={{ whiteSpace: 'nowrap' }}
            >
              Max
            </Button>
          )}
        </div>
        {validationErrors && !validationErrors.valid && validationErrors.fields?.amount ? (
          <FieldHelperText id="amount-error" style={{ color: '#f87171' }}>
            {validationErrors.fields.amount}
          </FieldHelperText>
        ) : (
          <FieldHelperText id="amount-helper">Supports up to 7 decimal places</FieldHelperText>
        )}
      </Stack>
    </Stack>
  );
}
