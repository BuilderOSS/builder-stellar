'use client';

import { Stack } from 'styled-system/jsx';

import { FieldHelperText, FieldLabel, Input, Text } from '@/components/ui';

type PercentageInputProps = {
  id: string;
  label: string;
  value: number | string | null | undefined;
  onChange: (bps: number) => void;
  helperText?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
};

const bpsToPercent = (bps: number): string => {
  return (bps / 100).toFixed(2);
};

const percentToBps = (percent: number): number => {
  return Math.round(percent * 100);
};

function parseValue(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function PercentageInput({
  id,
  label,
  value,
  onChange,
  helperText,
  disabled,
  min = 0,
  max = 100
}: PercentageInputProps) {
  const bps = parseValue(value);
  const percentageValue = bpsToPercent(bps);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const percentage = Number(event.target.value);
    if (Number.isNaN(percentage)) return;

    if (percentage < min || percentage > max) {
      return;
    }

    onChange(percentToBps(percentage));
  }

  return (
    <Stack gap="2">
      <div>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {helperText ? <FieldHelperText>{helperText}</FieldHelperText> : null}
      </div>

      <Stack gap="2">
        <Input
          id={id}
          type="number"
          min={String(min)}
          max={String(max)}
          step="0.01"
          value={percentageValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder="0.00"
        />
        <Text style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
          {percentageValue}% ({bps} basis points)
        </Text>
      </Stack>
    </Stack>
  );
}
