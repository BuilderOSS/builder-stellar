// src/lib/proposal-actions/actions/transfer-sac-token/component.tsx

'use client';

import { Stack } from 'styled-system/jsx';

import { Button, FieldHelperText, FieldLabel, Input, Select, Skeleton } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';

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
  const { balances, balancesLoading, balancesError } = context;

  const selectedBalance = balances?.find((b) => b.assetCode === value.assetCode);

  const balanceDisplay =
    value.assetCode && balances
      ? selectedBalance
        ? `${selectedBalance.balance} ${value.assetCode}`
        : `Balance unavailable for ${value.assetCode}`
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
          {getTreasuryAssets(context.config.name).map((asset) => (
            <option key={asset.code} value={asset.code}>
              {asset.code}
              {asset.isNative ? ' (Native)' : ''}
            </option>
          ))}
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
            <strong>Treasury balance:</strong>{' '}
            {balancesLoading ? (
              <Skeleton className="skeleton--inline" style={{ width: '90px', height: '1em' }} />
            ) : (
              balanceDisplay
            )}
          </FieldHelperText>
        )}
        {balancesError ? (
          <FieldHelperText>Balance unavailable: {balancesError}. Previous balances may be stale.</FieldHelperText>
        ) : null}
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
              type="text"
              inputMode="decimal"
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
              disabled={disabled || balancesLoading || !!balancesError}
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
