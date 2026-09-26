'use client';

import { Stack } from 'styled-system/jsx';

import { FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { MIN_RESERVE_PRICE_TOKENS } from '@/lib/auction-values';

export function AuctionReservePriceField({
  value,
  onChange,
  tokenCode = 'payment tokens',
  error,
  disabled = false,
  id = 'auction-reserve-price'
}: {
  value: string;
  onChange: (value: string) => void;
  tokenCode?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Stack gap="2">
      <FieldLabel htmlFor={id}>Minimum reserve amount ({tokenCode})</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="100"
        disabled={disabled}
      />
      <FieldHelperText>
        Minimum {MIN_RESERVE_PRICE_TOKENS} {tokenCode}; up to 7 decimal places.
      </FieldHelperText>
      {error ? <FieldHelperText style={{ color: 'var(--negative)' }}>{error}</FieldHelperText> : null}
    </Stack>
  );
}
