// src/lib/proposal-actions/actions/transfer-sac-token/component.tsx

'use client';

import { css } from 'styled-system/css';
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
          <FieldHelperText id="asset-code-error" tone="error">
            {validationErrors.fields.assetCode}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Which asset the treasury sends</FieldHelperText>
        )}
        {balanceDisplay && (
          <FieldHelperText>
            <strong>Treasury balance:</strong>{' '}
            {balancesLoading ? (
              <Skeleton className={css({ display: 'inline-block', width: '22', height: '1em' })} />
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
          <FieldHelperText id="recipient-error" tone="error">
            {validationErrors.fields.recipient}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Enter a valid Stellar address</FieldHelperText>
        )}
      </Stack>

      <Stack gap="2">
        <FieldLabel htmlFor="amount">Amount</FieldLabel>
        <div className={css({ display: 'flex', gap: '2' })}>
          <div className={css({ flex: '1', minW: '0' })}>
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
              variant="secondary"
              onClick={handleMaxClick}
              disabled={disabled || balancesLoading || !!balancesError}
            >
              Max
            </Button>
          )}
        </div>
        {validationErrors && !validationErrors.valid && validationErrors.fields?.amount ? (
          <FieldHelperText id="amount-error" tone="error">
            {validationErrors.fields.amount}
          </FieldHelperText>
        ) : (
          <FieldHelperText id="amount-helper">Supports up to 7 decimal places</FieldHelperText>
        )}
      </Stack>
    </Stack>
  );
}
