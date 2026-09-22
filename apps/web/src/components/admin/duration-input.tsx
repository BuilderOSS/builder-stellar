'use client';

import { Stack } from 'styled-system/jsx';

import { FieldHelperText, FieldLabel, Input, Text } from '@/components/ui';
import { clampDurationParts, combineDuration, type DurationParts, splitDuration } from '@/lib/duration';

type DurationInputProps = {
  id: string;
  label: string;
  value: number | string | null | undefined;
  onChange: (seconds: number) => void;
  helperText?: string;
  disabled?: boolean;
};

type DurationKey = keyof DurationParts;

type DurationDraftParts = Record<DurationKey, string>;

const INPUTS: Array<{ key: DurationKey; label: string; placeholder: string; max?: number }> = [
  { key: 'days', label: 'Days', placeholder: '0' },
  { key: 'hours', label: 'Hours', placeholder: '0', max: 23 },
  { key: 'minutes', label: 'Minutes', placeholder: '0', max: 59 },
  { key: 'seconds', label: 'Seconds', placeholder: '0', max: 59 }
];

function parseValue(value: number | string | null | undefined) {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function toDraftParts(value: number | string | null | undefined): DurationDraftParts {
  if (value === null || typeof value === 'undefined' || value === '') {
    return { days: '', hours: '', minutes: '', seconds: '' };
  }

  const parts = splitDuration(parseValue(value));
  return {
    days: String(parts.days),
    hours: String(parts.hours),
    minutes: String(parts.minutes),
    seconds: String(parts.seconds)
  };
}

function parseDraftParts(parts: DurationDraftParts) {
  return clampDurationParts({
    days: Number(parts.days || 0),
    hours: Number(parts.hours || 0),
    minutes: Number(parts.minutes || 0),
    seconds: Number(parts.seconds || 0)
  });
}

export function DurationInput({ id, label, value, onChange, helperText, disabled }: DurationInputProps) {
  const parts = toDraftParts(value);

  function emit(nextParts: DurationParts) {
    onChange(combineDuration(nextParts));
  }

  function updatePart(key: DurationKey, nextValue: string) {
    const nextParts = { ...parts, [key]: nextValue };
    emit(parseDraftParts(nextParts));
  }

  function handleBlur(key: DurationKey, max?: number) {
    const clamped = parseDraftParts(parts);
    const nextParts = {
      ...parts,
      [key]: String(typeof max === 'number' ? Math.min(max, clamped[key]) : clamped[key])
    };

    emit(parseDraftParts(nextParts));
  }

  return (
    <Stack gap="3">
      <div>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {helperText ? <FieldHelperText>{helperText}</FieldHelperText> : null}
      </div>

      <div className="duration-grid">
        {INPUTS.map((input) => {
          const currentValue = parts[input.key];

          return (
            <Stack key={input.key} gap="1" align="flex-start">
              <Text className="label" style={{ fontSize: '0.78rem', margin: 0 }}>
                {input.label}
              </Text>
              <Input
                id={`${id}-${input.key}`}
                type="number"
                min="0"
                max={typeof input.max === 'number' ? String(input.max) : undefined}
                step="1"
                value={currentValue}
                placeholder={input.placeholder}
                disabled={disabled}
                onChange={(event) => updatePart(input.key, event.target.value)}
                onBlur={() => handleBlur(input.key, input.max)}
              />
            </Stack>
          );
        })}
      </div>
      <style jsx>{`
        .duration-grid {
          display: grid;
          gap: 0.5rem;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: start;
        }

        @media (min-width: 768px) {
          .duration-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
      `}</style>
    </Stack>
  );
}
